import { SupabaseClient } from "@supabase/supabase-js"
/**
 * lib/filing-pipeline.ts
 * Filing phase state machine + evaluator for PatentPending.app
 *
 * Phases (filing_status values):
 *   draft → provisional_ready → provisional_filed → nonprovisional_prep
 *   → nonprov_filed → examination → granted / abandoned
 *
 * evaluatePatentPhase() is called after any patent PATCH.
 * It computes the correct phase and updates current_phase if it changes.
 */

import { createClient } from '@supabase/supabase-js'


// ── Phase definitions ─────────────────────────────────────────────────────────
export const FILING_PHASES = [
  { key: 'draft',               label: 'Drafted',           short: 'Draft',     step: 1 },
  { key: 'provisional_ready',   label: 'Provisional Ready', short: 'Ready',     step: 2 },
  { key: 'provisional_filed',   label: 'Provisional Filed', short: 'Filed',     step: 3 },
  { key: 'nonprovisional_prep', label: 'Non-Prov Prep',     short: 'Prep',      step: 4 },
  { key: 'nonprov_filed',       label: 'NP Filed',          short: 'NP Filed',  step: 5 },
  { key: 'examination',         label: 'Examination',       short: 'Exam',      step: 6 },
  { key: 'granted',             label: 'Granted',           short: 'Granted',   step: 7 },
] as const

export type FilingPhaseKey = typeof FILING_PHASES[number]['key']

export const PHASE_NEXT_ACTION: Record<string, string> = {
  draft:               'Complete your invention description and claims to prepare for filing',
  provisional_ready:   'Review your application and file your provisional at patentcenter.uspto.gov',
  provisional_filed:   'Your provisional is filed. You have 12 months to file the non-provisional.',
  nonprovisional_prep: 'Complete your non-provisional application. Check the Filing Checklist tab.',
  nonprov_filed:       'Application under review. Watch for correspondence from USPTO.',
  examination:         'Respond to any Office Actions from the USPTO within the stated deadline.',
  granted:             'Your patent has been granted. Set maintenance fee reminders.',
  abandoned:           'This application was abandoned. Contact a patent attorney to explore options.',
}

export function getPhaseStep(filingStatus: string | null): number {
  const phase = FILING_PHASES.find(p => p.key === filingStatus)
  return phase?.step ?? 1
}

export function getPhaseLabel(filingStatus: string | null): string {
  const phase = FILING_PHASES.find(p => p.key === filingStatus)
  return phase?.label ?? 'Drafted'
}

export function getNextAction(filingStatus: string | null): string {
  return PHASE_NEXT_ACTION[filingStatus ?? 'draft'] ?? PHASE_NEXT_ACTION.draft
}

// ── Phase transition logic ────────────────────────────────────────────────────
/**
 * Computes the correct filing_status for a patent record.
 * Returns null if no transition is warranted.
 */
export function computeFilingStatus(patent: {
  filing_status?: string | null
  claims_draft?: string | null
  description?: string | null
  spec_draft?: string | null
  provisional_app_number?: string | null
  provisional_filed_at?: string | null
  nonprov_deadline_at?: string | null
}): string | null {
  const current = patent.filing_status ?? 'draft'

  // draft → provisional_ready: has claims + (description or spec_draft)
  if (current === 'draft') {
    const hasClaims = !!(patent.claims_draft?.trim())
    const hasSpec   = !!(patent.spec_draft?.trim() || patent.description?.trim())
    if (hasClaims && hasSpec) return 'provisional_ready'
  }

  // provisional_ready → provisional_filed: has provisional_app_number
  if (current === 'provisional_ready') {
    if (patent.provisional_app_number?.trim()) return 'provisional_filed'
  }

  // provisional_filed → nonprovisional_prep: auto-trigger after filing
  // (this is set by mark-filed route; we reinforce here for robustness)
  if (current === 'provisional_filed') {
    if (patent.provisional_filed_at && patent.nonprov_deadline_at) return 'nonprovisional_prep'
  }

  return null // no transition
}

// ── Server-side evaluator (call after any patent PATCH) ──────────────────────
export async function evaluatePatentPhase(
  patentId: string,
  supabaseService: SupabaseClient<any, any, any>
): Promise<void> {
  try {
    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, owner_id, filing_status, claims_draft, spec_draft, description, provisional_app_number, provisional_filed_at, nonprov_deadline_at, current_phase')
      .eq('id', patentId)
      .single()

    if (!patent) return

    const newStatus = computeFilingStatus(patent)
    if (!newStatus) return // no transition needed

    const newPhase = getPhaseStep(newStatus)

    console.log(`[filing-pipeline] ${patent.filing_status} → ${newStatus} (phase ${newPhase}) for ${patentId}`)

    // Update patent
    await supabaseService
      .from('patents')
      .update({ filing_status: newStatus, current_phase: newPhase, updated_at: new Date().toISOString() })
      .eq('id', patentId)

    // Log auto-transition to correspondence
    await supabaseService.from('patent_correspondence').insert({
      patent_id:           patentId,
      owner_id:            patent.owner_id,
      title:               `Filing status automatically advanced to "${getPhaseLabel(newStatus)}"`,
      type:                'boclaw_note',
      content:             `PatentPending.app detected that this patent meets the criteria to advance from "${getPhaseLabel(patent.filing_status)}" to "${getPhaseLabel(newStatus)}". Phase updated automatically.`,
      from_party:          'PatentPending.app',
      correspondence_date: new Date().toISOString().split('T')[0],
      tags:                ['auto_transition', 'filing_pipeline'],
    })
  } catch (err) {
    console.error('[filing-pipeline] evaluatePatentPhase error:', err)
    // Never throw — this is a background enhancement, never a blocker
  }
}
