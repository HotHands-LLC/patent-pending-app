/**
 * POST /api/onboarding/complete
 * P16: Inventor Onboarding — First 10 Minutes
 *
 * Called after the user completes all 3 onboarding steps.
 * Creates a provisional_draft patent and marks onboarding_completed = true.
 * Also supports skip=true for the "Skip for now →" bypass.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity-log'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/** Derive a concise working title from the user's raw description */
function deriveTitle(description: string): string {
  // Capitalize and trim to ~80 chars; use as working title
  const clean = description.trim().replace(/[.!?]+$/, '').trim()
  if (clean.length <= 80) return clean.charAt(0).toUpperCase() + clean.slice(1)
  // Truncate at last word boundary before 80 chars
  const truncated = clean.slice(0, 80).replace(/\s\S*$/, '')
  return (truncated.charAt(0).toUpperCase() + truncated.slice(1)) + '…'
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const skip = body.skip === true

  // ── Skip flow: just mark onboarding_completed ───────────────────────────
  if (skip) {
    await supabaseService
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id)
    return NextResponse.json({ skipped: true })
  }

  // ── Full flow ───────────────────────────────────────────────────────────
  const { description, inventionType, privacyResponse } = body as {
    description?: string
    inventionType?: string
    privacyResponse?: string
  }

  if (!description || typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const title = deriveTitle(description)

  // Normalize type → status-compatible enum value
  // We store it as a tag for now since patent.type isn't a formal column
  const tags: string[] = []
  if (inventionType) tags.push(`type:${inventionType.toLowerCase().replace(/[\s/]+/g, '_')}`)
  if (privacyResponse) {
    const disclosed = /yes|told|shown|public/i.test(privacyResponse)
    tags.push(disclosed ? 'disclosed:yes' : 'disclosed:no')
  }

  // ── Create patent record ────────────────────────────────────────────────
  const { data: patent, error: insertError } = await supabaseService
    .from('patents')
    .insert({
      owner_id: user.id,
      title,
      description: description.trim(),
      inventors: [],
      status: 'provisional_draft',
      tags,
      is_listed: false,
    })
    .select()
    .single()

  if (insertError || !patent) {
    console.error('[onboarding/complete] insert error:', insertError)
    return NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 })
  }

  // ── Mark onboarding complete ────────────────────────────────────────────
  await supabaseService
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', user.id)

  // ── Activity log ────────────────────────────────────────────────────────
  await logActivity({
    patentId: patent.id,
    userId: user.id,
    actorType: 'pattie',
    actorLabel: 'Pattie',
    actionType: 'pattie_conversation',
    summary: 'Pattie onboarding complete',
    metadata: { source: 'onboarding', inventionType, privacyResponse },
  })

  return NextResponse.json({ patent_id: patent.id, title }, { status: 201 })
}
