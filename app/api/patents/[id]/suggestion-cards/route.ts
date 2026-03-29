/**
 * GET  /api/patents/[id]/suggestion-cards
 * Returns up to 3 Pattie proactive suggestion cards based on DB-only checks.
 * No LLM calls.
 *
 * POST /api/patents/[id]/suggestion-cards
 * Logs a card dismissal to patent_activity_log.
 *
 * P-Fix-3b: Pattie Proactive Suggestion Cards
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function makeClients(token: string) {
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  return { svc, userClient }
}

function getDaysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export type SuggestionCard = {
  card_type: string
  message: string
  suppressible: boolean
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { svc, userClient } = makeClients(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Fetch patent (including potentially unmapped fields) ─────────────────
  const { data: patent, error: patentErr } = await svc
    .from('patents')
    .select('owner_id, provisional_deadline, nonprov_deadline_at, figures_confirmed, figures_uploaded, spec_draft, claims_draft, filing_status')
    .eq('id', patentId)
    .single()

  if (patentErr || !patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })

  // Only owner sees suggestion cards
  if (patent.owner_id !== user.id) return NextResponse.json({ cards: [] })

  // ── Fetch dismissed cards in last 24h ────────────────────────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: dismissed } = await svc
    .from('patent_activity_log')
    .select('metadata')
    .eq('patent_id', patentId)
    .eq('action_type', 'pattie_suggestion_rejected')
    .gte('created_at', cutoff)

  const dismissedTypes = new Set<string>(
    (dismissed ?? [])
      .map((r: { metadata: unknown }) => {
        const m = r.metadata as Record<string, unknown> | null
        return (m?.card_type as string) ?? ''
      })
      .filter(Boolean)
  )

  // ── Count IDS candidates (any status) ───────────────────────────────────
  const { count: priorArtCount } = await svc
    .from('research_ids_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('patent_id', patentId)

  // ── Determine deadline days ──────────────────────────────────────────────
  // Prefer non-provisional deadline after provisional filed, else provisional deadline
  const deadlineStr: string | null =
    (patent.nonprov_deadline_at as string | null) ??
    (patent.provisional_deadline as string | null) ?? null

  const daysToDeadline: number | null = deadlineStr ? getDaysUntil(deadlineStr) : null

  // ── figures_confirmed: use dedicated column if present, else figures_uploaded ──
  const figuresConfirmed = (patent as Record<string, unknown>).figures_confirmed as boolean | null
  const figuresOk: boolean =
    figuresConfirmed != null ? figuresConfirmed : !!(patent.figures_uploaded)

  // ── Build candidate cards (priority order) ───────────────────────────────
  const candidates: SuggestionCard[] = []

  // 1. Deadline < 7 days (NEVER suppressible)
  if (daysToDeadline != null && daysToDeadline < 7) {
    candidates.push({
      card_type: 'deadline_critical',
      message: `⚠️ Filing deadline in ${daysToDeadline} day${daysToDeadline !== 1 ? 's' : ''}. Want a final readiness check?`,
      suppressible: false,
    })
  }

  // 2. Figures not confirmed
  if (!figuresOk && !dismissedTypes.has('figures_not_confirmed')) {
    candidates.push({
      card_type: 'figures_not_confirmed',
      message: "Figures aren't confirmed yet. Want me to walk you through what's needed?",
      suppressible: true,
    })
  }

  // 3. IDS empty AND deadline < 30 days
  const idsCount = priorArtCount ?? 0
  if (idsCount === 0 && daysToDeadline != null && daysToDeadline < 30 && !dismissedTypes.has('ids_empty')) {
    candidates.push({
      card_type: 'ids_empty',
      message: "Your IDS is empty. Want me to run a prior art search?",
      suppressible: true,
    })
  }

  // 4. Spec too thin (< 2500 words)
  const specWords = countWords(patent.spec_draft as string | null)
  if (specWords > 0 && specWords < 2500 && !dismissedTypes.has('spec_thin')) {
    candidates.push({
      card_type: 'spec_thin',
      message: "Your spec is a bit thin for a non-provisional. Want me to expand it?",
      suppressible: true,
    })
  }

  // 5. No claims drafted
  const claimsMissing = !patent.claims_draft || (patent.claims_draft as string).trim() === ''
  if (claimsMissing && !dismissedTypes.has('no_claims')) {
    candidates.push({
      card_type: 'no_claims',
      message: "You don't have any claims drafted yet. Want to start with Claim 1?",
      suppressible: true,
    })
  }

  // ── Return max 3 ────────────────────────────────────────────────────────
  return NextResponse.json({ cards: candidates.slice(0, 3) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { svc, userClient } = makeClients(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { card_type, dismissed_at } = body as { card_type?: string; dismissed_at?: string }
  if (!card_type) return NextResponse.json({ error: 'card_type required' }, { status: 400 })

  await svc.from('patent_activity_log').insert({
    patent_id:   patentId,
    user_id:     user.id,
    actor_type:  'user',
    actor_label: 'User',
    action_type: 'pattie_suggestion_rejected',
    summary:     `Dismissed Pattie suggestion: ${card_type}`,
    metadata:    { card_type, dismissed_at: dismissed_at ?? new Date().toISOString() },
  })

  return NextResponse.json({ ok: true })
}
