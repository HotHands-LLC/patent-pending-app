/**
 * POST /api/correspondence
 * Creates a new patent_correspondence record.
 * Tier gate: Pro / Complimentary / Attorney (all get write access).
 * Free users → 403 TIER_REQUIRED.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTierInfo, tierRequiredResponse } from '@/lib/tier'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Tier gate: correspondence write requires Pro or Attorney ──────────────
  // Attorneys always get write access (they're doing legal work)
  const tierInfo = await getUserTierInfo(user.id)
  const canWrite = tierInfo.subscription_status === 'pro'
    || tierInfo.subscription_status === 'complimentary'
    || tierInfo.is_attorney

  if (!canWrite) {
    return tierRequiredResponse('correspondence_write')
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, type, patent_id, correspondence_date, from_party, to_party, content, tags, attachments } = body

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // If patent_id provided, verify user has access (owner or collaborator)
  if (patent_id && typeof patent_id === 'string') {
    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, owner_id')
      .eq('id', patent_id)
      .single()

    if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })

    if (patent.owner_id !== user.id) {
      // Check collaborator access
      const { data: collab } = await supabaseService
        .from('patent_collaborators')
        .select('id, role')
        .eq('patent_id', patent_id)
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .single()

      if (!collab) {
        return NextResponse.json({ error: 'Forbidden — no access to this patent' }, { status: 403 })
      }
    }
  }

  const { data, error } = await supabaseService
    .from('patent_correspondence')
    .insert({
      title,
      type: type ?? 'other',
      owner_id: user.id,
      patent_id: patent_id ?? null,
      correspondence_date: correspondence_date ?? new Date().toISOString().split('T')[0],
      from_party: from_party ?? null,
      to_party: to_party ?? null,
      content: content ?? null,
      tags: Array.isArray(tags) ? tags : null,
      attachments: Array.isArray(attachments) ? attachments : [],
    })
    .select('id')
    .single()

  if (error) {
    console.error('[correspondence/POST] insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, ok: true })
}
