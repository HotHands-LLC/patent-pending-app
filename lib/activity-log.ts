/**
 * lib/activity-log.ts — Patent activity logging (WHO/WHAT/WHEN journal)
 *
 * Log every meaningful action on a patent so Pattie and users have full context.
 * Non-blocking: errors are silently swallowed to never break user flows.
 *
 * P9: Pattie WHO/WHAT/WHEN Journal — cont.55
 */
import { createClient } from '@supabase/supabase-js'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

export interface ActivityLogParams {
  patentId: string
  userId?: string | null
  actorType: 'user' | 'pattie' | 'system' | 'attorney' | 'collaborator'
  actorLabel?: string
  actionType: string
  fieldChanged?: string
  oldValue?: string | null
  newValue?: string | null
  summary: string
  pattieSessionId?: string
  metadata?: Record<string, unknown>
}

const ACTION_TYPES = [
  'spec_edit', 'claims_edit', 'title_edit', 'figure_upload', 'figure_confirm',
  'pattie_suggestion_applied', 'pattie_suggestion_rejected', 'pattie_conversation',
  'collaborator_added', 'collaborator_edit', 'status_change', 'filing_step_complete',
  'correspondence_added', 'ids_candidate_added', 'deep_research_run',
  'export_generated', 'admin_action',
] as const

/** Log a patent activity. Non-blocking — never throws. */
export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    const { patentId, userId, actorType, actorLabel, actionType, fieldChanged,
      oldValue, newValue, summary, pattieSessionId, metadata } = params

    await getSvc().from('patent_activity_log').insert({
      patent_id:         patentId,
      user_id:           userId ?? null,
      actor_type:        actorType,
      actor_label:       actorLabel ?? null,
      action_type:       actionType,
      field_changed:     fieldChanged ?? null,
      old_value:         oldValue ? oldValue.slice(0, 500) : null,
      new_value:         newValue ? newValue.slice(0, 500) : null,
      summary:           summary.slice(0, 300),
      pattie_session_id: pattieSessionId ?? null,
      metadata:          metadata ?? null,
    })
  } catch { /* non-blocking — never break user flows */ }
}

/** Fetch last N activity entries for a patent (for Pattie context injection) */
export async function getRecentActivity(patentId: string, limit = 10): Promise<Array<{
  actor_label: string | null; action_type: string; summary: string; created_at: string
}>> {
  try {
    const { data } = await getSvc()
      .from('patent_activity_log')
      .select('actor_label, action_type, summary, created_at')
      .eq('patent_id', patentId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return data ?? []
  } catch { return [] }
}

/** Format activity entries for Pattie context injection */
export function formatActivityContext(entries: Array<{
  actor_label: string | null; action_type: string; summary: string; created_at: string
}>): string {
  if (!entries.length) return ''
  const lines = entries.slice(0, 10).map(e => {
    const ago = getRelativeTime(e.created_at)
    const actor = e.actor_label ?? e.action_type.split('_')[0]
    return `- [${ago}] ${actor}: ${e.summary}`
  })
  return `[Patent Activity — last ${lines.length} actions]\n${lines.join('\n')}\n`
}

function getRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
