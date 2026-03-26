/**
 * lib/queue-eta.ts — Queue ETA estimation engine
 * Estimates per-item and total queue completion time from historical run data.
 */
import { createClient } from '@supabase/supabase-js'

const DEFAULT_ESTIMATE_SECONDS = 6 * 60 // 6 min default

export interface QueueETA {
  activeItem: {
    label: string
    elapsedSeconds: number
    estimatedTotalSeconds: number
    estimatedRemainingSeconds: number
    percentComplete: number
  } | null
  queuedItems: Array<{
    id: string
    label: string
    estimatedSeconds: number
    estimatedStart: Date
    estimatedEnd: Date
  }>
  totalEstimatedSeconds: number
  estimatedAllComplete: Date
  confidence: 'high' | 'medium' | 'low'
  canSleep: boolean
  canSleepReason: string
}

function getLabelPrefix(label: string): string {
  // Extract prefix like Q*, M*, S*, etc.
  const m = label.match(/^([A-Z0-9]+[-_]?)/)
  return m ? m[1].toLowerCase().replace(/[-_]$/, '') : 'misc'
}

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

export async function getQueueETA(): Promise<QueueETA> {
  const svc = getSvc()
  const now = new Date()

  // Fetch historical completed items with duration
  const { data: history } = await svc
    .from('claw_prompt_queue')
    .select('prompt_label, duration_seconds')
    .eq('status', 'complete')
    .not('duration_seconds', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(100)

  // Build prefix → median duration map
  const prefixDurations: Record<string, number[]> = {}
  for (const h of history ?? []) {
    const prefix = getLabelPrefix(h.prompt_label)
    if (!prefixDurations[prefix]) prefixDurations[prefix] = []
    prefixDurations[prefix].push(h.duration_seconds)
  }

  function estimateForLabel(label: string): { seconds: number; confidence: 'high' | 'medium' | 'low' } {
    const prefix = getLabelPrefix(label)
    const samples = prefixDurations[prefix] ?? []
    if (samples.length >= 3) {
      const sorted = [...samples].sort((a, b) => a - b)
      return { seconds: sorted[Math.floor(sorted.length / 2)], confidence: 'high' }
    }
    if (samples.length > 0) {
      return { seconds: Math.round(samples.reduce((a, b) => a + b) / samples.length), confidence: 'medium' }
    }
    return { seconds: DEFAULT_ESTIMATE_SECONDS, confidence: 'low' }
  }

  // Fetch active + queued items
  const { data: items } = await svc
    .from('claw_prompt_queue')
    .select('id, prompt_label, status, started_at, priority')
    .in('status', ['in_progress', 'queued'])
    .order('status', { ascending: false })
    .order('priority', { ascending: true })
    .limit(50)

  const active = (items ?? []).find(i => i.status === 'in_progress')
  const queued = (items ?? []).filter(i => i.status === 'queued')

  let activeItem: QueueETA['activeItem'] = null
  let cursor = new Date(now)
  let overallConfidence: 'high' | 'medium' | 'low' = 'high'

  if (active) {
    const elapsedSeconds = Math.floor((now.getTime() - new Date(active.started_at ?? now).getTime()) / 1000)
    const { seconds: estimated, confidence } = estimateForLabel(active.prompt_label)
    if (confidence !== 'high') overallConfidence = confidence
    const remaining = Math.max(30, estimated - elapsedSeconds)
    activeItem = {
      label: active.prompt_label,
      elapsedSeconds,
      estimatedTotalSeconds: estimated,
      estimatedRemainingSeconds: remaining,
      percentComplete: Math.min(95, Math.round((elapsedSeconds / estimated) * 100)),
    }
    cursor = new Date(now.getTime() + remaining * 1000)
  }

  const queuedItems: QueueETA['queuedItems'] = []
  for (const q of queued) {
    const { seconds, confidence } = estimateForLabel(q.prompt_label)
    if (confidence !== 'high') overallConfidence = confidence === 'low' ? 'low' : overallConfidence
    const start = new Date(cursor)
    const end = new Date(cursor.getTime() + seconds * 1000)
    queuedItems.push({ id: q.id, label: q.prompt_label, estimatedSeconds: seconds, estimatedStart: start, estimatedEnd: end })
    cursor = end
  }

  const totalSeconds = Math.round((cursor.getTime() - now.getTime()) / 1000)

  // Can I sleep?
  const hasP0 = false // caller can check errors separately
  const hoursUntilDone = totalSeconds / 3600
  const canSleep = hoursUntilDone < 6 && !hasP0
  const canSleepReason = !canSleep
    ? 'Check back — complex jobs still running'
    : queued.length === 0 && !active
    ? 'Queue is clear'
    : `All jobs complete by ~${cursor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`

  return {
    activeItem, queuedItems, totalEstimatedSeconds: totalSeconds,
    estimatedAllComplete: cursor, confidence: overallConfidence,
    canSleep, canSleepReason,
  }
}
