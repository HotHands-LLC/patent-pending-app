/**
 * pattie-monitoring.ts
 * Pattie's Proactive Monitoring System — 7 triggers for patent lifecycle events.
 * Prompt 52D — PatentPending
 *
 * All triggers mirror the Python-side evaluation in scripts/pattie-monitor.py.
 */

import type { PatentLifecycleState, PatentContext } from './patent-lifecycle'
import type { PattieToolName } from './pattie-tools'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Patent } from './supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MonitoringTrigger {
  id: string
  name: string
  description: string
  check: (context: PatentContext) => boolean
  action: PattieToolName
  action_params: (patent: Patent) => Record<string, unknown>
  cooldown_days: number
  max_fires_per_patent: number // -1 = unlimited
  notify_telegram: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const now = new Date()
  const target = new Date(dateStr)
  return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const days = daysUntil(dateStr)
  return days !== null ? -days : null
}

// ── Triggers ───────────────────────────────────────────────────────────────────

const deadline_critical_trigger: MonitoringTrigger = {
  id: 'deadline_critical',
  name: 'Conversion Deadline Critical',
  description: 'Provisional conversion deadline ≤ 14 days — urgent owner notification',
  check: (ctx) => {
    const state = (ctx.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
    if (state !== 'PROVISIONAL_ACTIVE') return false
    const days = daysUntil(ctx.patent.nonprov_deadline_at)
    return days !== null && days >= 0 && days <= 14
  },
  action: 'notify_owner',
  action_params: (patent) => {
    const days = daysUntil(patent.nonprov_deadline_at) ?? 0
    return {
      subject: `⚠️ URGENT: Patent conversion deadline in ${days} day${days === 1 ? '' : 's'}`,
      body: `Your provisional patent application "${patent.title}" (App #${patent.application_number ?? 'pending'}) must be converted to a non-provisional within ${days} day${days === 1 ? '' : 's'}.\n\nMissing this deadline means your priority date is permanently lost. There is no USPTO extension for this deadline under 35 USC 119(e).\n\nTo file: visit patentcenter.uspto.gov to submit your non-provisional application.\n\nIf you need assistance with your filing package, log in to patentpending.app and review your patent's filing documents.\n\nDo not delay.`,
    }
  },
  cooldown_days: 3,
  max_fires_per_patent: 5,
  notify_telegram: true,
}

const deadline_warning_trigger: MonitoringTrigger = {
  id: 'deadline_warning',
  name: 'Conversion Deadline Warning',
  description: 'Provisional conversion deadline 15–60 days away — friendly reminder',
  check: (ctx) => {
    const state = (ctx.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
    if (state !== 'PROVISIONAL_ACTIVE') return false
    const days = daysUntil(ctx.patent.nonprov_deadline_at)
    return days !== null && days > 14 && days <= 60
  },
  action: 'send_reminder',
  action_params: (patent) => {
    const days = daysUntil(patent.nonprov_deadline_at) ?? 0
    const deadline = patent.nonprov_deadline_at
      ? new Date(patent.nonprov_deadline_at).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'approaching'
    return {
      subject: `Patent conversion deadline approaching: ${patent.title}`,
      body: `Your provisional patent "${patent.title}" has ${days} days until its conversion deadline (${deadline}).\n\nTo maintain your priority date, you must file a non-provisional application before this date. PatentPending has your filing documents ready — log in to review and download your filing package.\n\nQuestions? Open a Pattie conversation on your patent for guidance.`,
      recipient_email: '', // populated at runtime from patent owner profile
    }
  },
  cooldown_days: 14,
  max_fires_per_patent: 3,
  notify_telegram: false,
}

const inventor_signatures_needed_trigger: MonitoringTrigger = {
  id: 'inventor_signatures_needed',
  name: 'Inventor Signatures Pending',
  description: 'Patent is READY_TO_FILE but has pending signing requests',
  check: (ctx) => {
    const state = (ctx.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
    return state === 'READY_TO_FILE' && (ctx.pendingSigningRequests ?? 0) > 0
  },
  action: 'send_reminder',
  action_params: (patent) => ({
    subject: `Signature needed before "${patent.title}" can be filed`,
    body: `One or more inventors have not yet signed their declaration for "${patent.title}". Filing cannot proceed until all signatures are collected.\n\nLog in to patentpending.app to view the signing status and send reminders to pending signers.`,
    recipient_email: '', // populated at runtime
  }),
  cooldown_days: 7,
  max_fires_per_patent: 4,
  notify_telegram: false,
}

const office_action_urgent_trigger: MonitoringTrigger = {
  id: 'office_action_urgent',
  name: 'Office Action Deadline Approaching',
  description: 'Office action response deadline ≤ 30 days — flag for review',
  check: (ctx) => {
    const state = (ctx.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
    if (state !== 'OFFICE_ACTION') return false
    if (!ctx.patent.office_action_deadline) return false
    const days = daysUntil(ctx.patent.office_action_deadline?.toString())
    return days !== null && days >= 0 && days <= 30
  },
  action: 'flag_for_review',
  action_params: (patent) => {
    const days = daysUntil(patent.office_action_deadline?.toString()) ?? 0
    const urgency: 'critical' | 'high' | 'medium' =
      days <= 7 ? 'critical' : days <= 14 ? 'high' : 'medium'
    return {
      reason: `Office action response deadline in ${days} day${days === 1 ? '' : 's'} — immediate attorney review required`,
      urgency,
    }
  },
  cooldown_days: 5,
  max_fires_per_patent: -1,
  notify_telegram: true,
}

const maintenance_approaching_trigger: MonitoringTrigger = {
  id: 'maintenance_approaching',
  name: 'Maintenance Fee Approaching',
  description: 'Patent maintenance fee due ≤ 90 days — advance notice',
  check: (ctx) => {
    const state = (ctx.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
    if (state !== 'GRANTED' && state !== 'MAINTENANCE_DUE') return false
    const days = daysUntil(ctx.patent.maintenance_next_at?.toString())
    return days !== null && days > 30 && days <= 90
  },
  action: 'send_reminder',
  action_params: (patent) => {
    const days = daysUntil(patent.maintenance_next_at?.toString()) ?? 0
    const dueDate = patent.maintenance_next_at
      ? new Date(patent.maintenance_next_at).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'upcoming'
    return {
      subject: `Maintenance fee due in ${days} days: ${patent.title}`,
      body: `Patent "${patent.title}" has a maintenance fee due on ${dueDate} (${days} days away).\n\nSmall entity fees (2025, verify at USPTO.gov):\n- 3.5 year: ~$800\n- 7.5 year: ~$1,800\n- 11.5 year: ~$3,700\n\nA 6-month grace period applies with a surcharge. After that, the patent lapses. Pay at uspto.gov/patents-application-process/paying-fees.`,
      recipient_email: '',
    }
  },
  cooldown_days: 30,
  max_fires_per_patent: 3,
  notify_telegram: false,
}

const maintenance_critical_trigger: MonitoringTrigger = {
  id: 'maintenance_critical',
  name: 'Maintenance Fee Critical',
  description: 'Patent maintenance fee due ≤ 30 days — urgent notification',
  check: (ctx) => {
    const state = (ctx.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
    if (state !== 'GRANTED' && state !== 'MAINTENANCE_DUE') return false
    const days = daysUntil(ctx.patent.maintenance_next_at?.toString())
    return days !== null && days >= 0 && days <= 30
  },
  action: 'notify_owner',
  action_params: (patent) => {
    const days = daysUntil(patent.maintenance_next_at?.toString()) ?? 0
    return {
      subject: `⚠️ URGENT: Maintenance fee due in ${days} days — ${patent.title}`,
      body: `Patent "${patent.title}" maintenance fee is due in ${days} day${days === 1 ? '' : 's'}. After the due date, a 6-month grace period applies with a surcharge. After the grace period, the patent lapses and may only be revived by petition.\n\nPay immediately at: https://fees.uspto.gov\n\nVerify current fee amounts at USPTO.gov before paying.`,
    }
  },
  cooldown_days: 7,
  max_fires_per_patent: 5,
  notify_telegram: true,
}

const stale_draft_trigger: MonitoringTrigger = {
  id: 'stale_draft',
  name: 'Stale Draft',
  description: 'Patent in DRAFT state with no activity in 30+ days',
  check: (ctx) => {
    const state = (ctx.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
    if (state !== 'DRAFT') return false
    const daysSinceUpdate = daysSince(ctx.patent.updated_at)
    return daysSinceUpdate !== null && daysSinceUpdate > 30
  },
  action: 'create_correspondence',
  action_params: (_patent) => ({
    title: 'Pattie: No recent activity on this draft',
    content:
      "Pattie noticed this patent draft hasn't been updated in over 30 days and has no recent Pattie conversations. Consider resuming work, or if this patent is no longer active, updating its status. Open a Pattie conversation to pick up where you left off.",
    type: 'ai_action',
  }),
  cooldown_days: 30,
  max_fires_per_patent: 2,
  notify_telegram: false,
}

// ── Exports ────────────────────────────────────────────────────────────────────

export const MONITORING_TRIGGERS: MonitoringTrigger[] = [
  deadline_critical_trigger,
  deadline_warning_trigger,
  inventor_signatures_needed_trigger,
  office_action_urgent_trigger,
  maintenance_approaching_trigger,
  maintenance_critical_trigger,
  stale_draft_trigger,
]

export async function isTriggerOnCooldown(
  patentId: string,
  triggerId: string,
  cooldownDays: number,
  supabase: SupabaseClient
): Promise<boolean> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - cooldownDays)

  const { data } = await supabase
    .from('pattie_monitoring_log')
    .select('id')
    .eq('patent_id', patentId)
    .eq('trigger_id', triggerId)
    .gte('fired_at', cutoff.toISOString())
    .limit(1)

  return (data?.length ?? 0) > 0
}

export async function getTriggerFireCount(
  patentId: string,
  triggerId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { count } = await supabase
    .from('pattie_monitoring_log')
    .select('id', { count: 'exact', head: true })
    .eq('patent_id', patentId)
    .eq('trigger_id', triggerId)
  return count ?? 0
}
