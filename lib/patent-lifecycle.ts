/**
 * patent-lifecycle.ts
 * Canonical TypeScript definition of all patent lifecycle states for PatentPending.
 * Pure data layer — no UI dependencies.
 */

import type { Patent } from '@/lib/supabase'

export type PatentLifecycleState =
  | 'DRAFT'
  | 'READY_TO_FILE'
  | 'FILED_PROVISIONAL'
  | 'PROVISIONAL_ACTIVE'
  | 'CONVERTING'
  | 'FILED_NONPROVISIONAL'
  | 'EXAMINATION'
  | 'OFFICE_ACTION'
  | 'FINAL_REJECTION'
  | 'ALLOWANCE'
  | 'ISSUE_FEE_DUE'
  | 'GRANTED'
  | 'MAINTENANCE_DUE'
  | 'EXPIRED'
  | 'ABANDONED'

export interface BlockingCondition {
  id: string
  label: string
  description: string
  blocking_state: PatentLifecycleState
  check: (patent: Patent) => boolean // returns true if condition IS blocking (problem exists)
  resolution: string
  pattie_can_act: boolean
  pattie_action?: string
}

export interface LifecycleStateDefinition {
  label: string
  description: string
  phase: 'pre_filing' | 'filing' | 'prosecution' | 'post_grant' | 'terminal'
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical'
  next_states: PatentLifecycleState[]
  blocking_conditions: BlockingCondition[]
  deadline_field?: string // key of Patent that holds relevant deadline
  pattie_watch: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const now = new Date()
  const target = new Date(dateStr)
  const diffMs = target.getTime() - now.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

// ── Blocking conditions (flat list for easy reference) ─────────────────────────

const BLOCKING_CONDITIONS: BlockingCondition[] = [
  // DRAFT
  {
    id: 'missing_title',
    label: 'Missing title',
    description: 'Patent must have a title before it can be filed.',
    blocking_state: 'DRAFT',
    check: (p) => !p.title || p.title.trim() === '',
    resolution: 'Add a title to the patent.',
    pattie_can_act: false,
  },
  {
    id: 'missing_abstract',
    label: 'Missing abstract',
    description: 'Patent must have an abstract draft before it can be filed.',
    blocking_state: 'DRAFT',
    check: (p) => !p.abstract_draft || p.abstract_draft.trim() === '',
    resolution: 'Draft the abstract for this patent.',
    pattie_can_act: false,
  },
  {
    id: 'missing_claims',
    label: 'Missing claims draft',
    description: 'Patent must have at least a draft of the claims before filing.',
    blocking_state: 'DRAFT',
    check: (p) => !p.claims_draft || p.claims_draft.trim() === '',
    resolution: 'Generate or draft the patent claims.',
    pattie_can_act: false,
  },

  {
    id: 'missing_figures',
    label: 'No figures attached',
    description: 'Patent applications typically require at least one figure to illustrate the invention.',
    blocking_state: 'DRAFT',
    check: (p) => !p.figures_uploaded,
    resolution: 'Upload at least one figure or drawing for this patent.',
    pattie_can_act: false,
  },

  // READY_TO_FILE
  {
    id: 'pending_inventor_signatures',
    label: 'Pending inventor signatures',
    description: 'All inventors must sign the declaration before filing.',
    blocking_state: 'READY_TO_FILE',
    // Signing state is tracked via the patent_signing_requests table (relational).
    // At this data layer we can't join — assume not blocking unless a flag exists.
    // The UI/hook layer can override via the signing requests panel.
    check: (_p) => false,
    resolution: 'Send signing requests to all inventors and wait for completion.',
    pattie_can_act: true,
    pattie_action: 'create_signing_request',
  },

  // FILED_PROVISIONAL
  {
    id: 'missing_filing_confirmation',
    label: 'Missing filing confirmation',
    description: 'Filing date must be confirmed at the USPTO before this application is active.',
    blocking_state: 'FILED_PROVISIONAL',
    check: (p) => !p.filing_date,
    resolution: 'Chad must confirm the USPTO filing date manually.',
    pattie_can_act: false,
  },

  // PROVISIONAL_ACTIVE
  {
    id: 'conversion_deadline_approaching',
    label: 'Conversion deadline approaching',
    description: 'Non-provisional conversion deadline is within 60 days.',
    blocking_state: 'PROVISIONAL_ACTIVE',
    check: (p) => {
      const days = daysUntil(p.nonprov_deadline_at)
      return days !== null && days >= 0 && days <= 60
    },
    resolution: 'Begin the non-provisional conversion process immediately.',
    pattie_can_act: true,
    pattie_action: 'send_reminder',
  },
  {
    id: 'conversion_deadline_passed',
    label: 'Conversion deadline PASSED',
    description: 'The 12-month window to convert from provisional to non-provisional has expired.',
    blocking_state: 'PROVISIONAL_ACTIVE',
    check: (p) => {
      const days = daysUntil(p.nonprov_deadline_at)
      return days !== null && days < 0
    },
    resolution: 'Consult a patent attorney immediately — priority date may be lost.',
    pattie_can_act: true,
    pattie_action: 'notify_owner',
  },

  // OFFICE_ACTION
  {
    id: 'office_action_deadline',
    label: 'Office action response deadline ≤ 30 days',
    description: 'USPTO office action response is due within 30 days.',
    blocking_state: 'OFFICE_ACTION',
    // No dedicated office_action_deadline_at column in current schema.
    // This condition is surfaced when the patent enters OFFICE_ACTION state;
    // the check always returns true so Pattie flags it for attorney review.
    check: (_p) => true,
    resolution: 'Assign to patent attorney for office action response immediately.',
    pattie_can_act: true,
    pattie_action: 'flag_for_review',
  },

  // GRANTED
  {
    id: 'maintenance_fee_due',
    label: 'Maintenance fee due soon',
    description: 'Next patent maintenance fee is due within 90 days.',
    blocking_state: 'GRANTED',
    // No maintenance_next_at column in current schema; check is latent (always false until column added).
    check: (_p) => false,
    resolution: 'Pay the maintenance fee to keep the patent in force.',
    pattie_can_act: true,
    pattie_action: 'send_reminder',
  },
]

// ── State machine ──────────────────────────────────────────────────────────────

export const PATENT_LIFECYCLE: Record<PatentLifecycleState, LifecycleStateDefinition> = {
  DRAFT: {
    label: 'Draft',
    description: 'Patent is being drafted. Title, abstract, and claims must be completed before filing.',
    phase: 'pre_filing',
    urgency: 'none',
    next_states: ['READY_TO_FILE', 'ABANDONED'],
    blocking_conditions: BLOCKING_CONDITIONS.filter(c => c.blocking_state === 'DRAFT'),
    pattie_watch: false,
  },

  READY_TO_FILE: {
    label: 'Ready to File',
    description: 'Patent draft is complete. Awaiting inventor signatures and USPTO submission.',
    phase: 'pre_filing',
    urgency: 'low',
    next_states: ['FILED_PROVISIONAL', 'ABANDONED'],
    blocking_conditions: BLOCKING_CONDITIONS.filter(c => c.blocking_state === 'READY_TO_FILE'),
    pattie_watch: true,
  },

  FILED_PROVISIONAL: {
    label: 'Filed (Provisional)',
    description: 'Provisional application submitted to USPTO. Awaiting confirmation of filing date.',
    phase: 'filing',
    urgency: 'low',
    next_states: ['PROVISIONAL_ACTIVE'],
    blocking_conditions: BLOCKING_CONDITIONS.filter(c => c.blocking_state === 'FILED_PROVISIONAL'),
    pattie_watch: false,
  },

  PROVISIONAL_ACTIVE: {
    label: 'Provisional Active',
    description: 'Provisional patent is active. Must convert to non-provisional within 12 months of filing.',
    phase: 'filing',
    urgency: 'medium',
    next_states: ['CONVERTING', 'ABANDONED'],
    blocking_conditions: BLOCKING_CONDITIONS.filter(c => c.blocking_state === 'PROVISIONAL_ACTIVE'),
    deadline_field: 'nonprov_deadline_at',
    pattie_watch: true,
  },

  CONVERTING: {
    label: 'Converting to Non-Provisional',
    description: 'Non-provisional conversion is in progress. Awaiting USPTO filing confirmation.',
    phase: 'filing',
    urgency: 'high',
    next_states: ['FILED_NONPROVISIONAL'],
    blocking_conditions: [],
    pattie_watch: true,
  },

  FILED_NONPROVISIONAL: {
    label: 'Filed (Non-Provisional)',
    description: 'Non-provisional application submitted to USPTO. Awaiting examination assignment.',
    phase: 'filing',
    urgency: 'low',
    next_states: ['EXAMINATION'],
    blocking_conditions: [],
    pattie_watch: false,
  },

  EXAMINATION: {
    label: 'Under Examination',
    description: 'Patent examiner is reviewing the application. No immediate action required.',
    phase: 'prosecution',
    urgency: 'low',
    next_states: ['OFFICE_ACTION', 'ALLOWANCE', 'ABANDONED'],
    blocking_conditions: [],
    pattie_watch: false,
  },

  OFFICE_ACTION: {
    label: 'Office Action Received',
    description: 'USPTO has issued an office action requiring a response. Deadline typically 3 months (extendable to 6).',
    phase: 'prosecution',
    urgency: 'high',
    next_states: ['EXAMINATION', 'FINAL_REJECTION', 'ALLOWANCE', 'ABANDONED'],
    blocking_conditions: BLOCKING_CONDITIONS.filter(c => c.blocking_state === 'OFFICE_ACTION'),
    pattie_watch: true,
  },

  FINAL_REJECTION: {
    label: 'Final Rejection',
    description: 'USPTO has issued a final rejection. Must appeal or abandon.',
    phase: 'prosecution',
    urgency: 'critical',
    next_states: ['ALLOWANCE', 'ABANDONED'],
    blocking_conditions: [],
    pattie_watch: true,
  },

  ALLOWANCE: {
    label: 'Notice of Allowance',
    description: 'Patent has been allowed. Issue fee must be paid within 3 months.',
    phase: 'prosecution',
    urgency: 'medium',
    next_states: ['ISSUE_FEE_DUE'],
    blocking_conditions: [],
    pattie_watch: true,
  },

  ISSUE_FEE_DUE: {
    label: 'Issue Fee Due',
    description: 'Issue fee payment required to complete patent grant. Deadline: 3 months from Notice of Allowance.',
    phase: 'prosecution',
    urgency: 'high',
    next_states: ['GRANTED', 'ABANDONED'],
    blocking_conditions: [],
    pattie_watch: true,
  },

  GRANTED: {
    label: 'Granted',
    description: 'Patent has been granted. Maintenance fees required at 3.5, 7.5, and 11.5 years.',
    phase: 'post_grant',
    urgency: 'none',
    next_states: ['MAINTENANCE_DUE', 'EXPIRED'],
    blocking_conditions: BLOCKING_CONDITIONS.filter(c => c.blocking_state === 'GRANTED'),
    pattie_watch: false,
  },

  MAINTENANCE_DUE: {
    label: 'Maintenance Fee Due',
    description: 'Patent maintenance fee is due. Pay to keep the patent in force.',
    phase: 'post_grant',
    urgency: 'high',
    next_states: ['GRANTED', 'EXPIRED'],
    blocking_conditions: [],
    pattie_watch: true,
  },

  EXPIRED: {
    label: 'Expired',
    description: 'Patent has expired. No further action possible.',
    phase: 'terminal',
    urgency: 'none',
    next_states: [],
    blocking_conditions: [],
    pattie_watch: false,
  },

  ABANDONED: {
    label: 'Abandoned',
    description: 'Patent application has been abandoned.',
    phase: 'terminal',
    urgency: 'none',
    next_states: [],
    blocking_conditions: [],
    pattie_watch: false,
  },
}

// ── Utility functions ──────────────────────────────────────────────────────────

/**
 * Returns all currently-active blocking conditions for a patent.
 * Only conditions matching the patent's current lifecycle_state are evaluated.
 */
export function getBlockingConditions(patent: Patent & { lifecycle_state?: string | null }): BlockingCondition[] {
  const state = (patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
  const stateDef = PATENT_LIFECYCLE[state]
  if (!stateDef) return []
  return stateDef.blocking_conditions.filter(c => c.check(patent))
}

/**
 * Returns the next reachable states from the given state (up to 3).
 */
export function getNextNodes(state: PatentLifecycleState): PatentLifecycleState[] {
  return PATENT_LIFECYCLE[state].next_states.slice(0, 3)
}
