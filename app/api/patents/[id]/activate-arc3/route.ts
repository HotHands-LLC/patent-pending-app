import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTierInfo, tierRequiredResponse, marketplaceLimitResponse } from '@/lib/tier'

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

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/**
 * POST /api/patents/[id]/activate-arc3
 * Body: { commission_pct?, ip_address?, licensing_exclusive?, licensing_nonexclusive?, licensing_field_of_use? }
 * Owner-only. Creates agency agreement record (clickwrap) and activates deal page.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { ip_address, commission_pct = 20, licensing_exclusive = false,
    licensing_nonexclusive = true, licensing_field_of_use = false } = body

  // Verify patent ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, title, owner_id, arc3_active, slug')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Tier gate: Marketplace requires Pro ─────────────────────────────────
  const tierInfo = await getUserTierInfo(user.id)
  // Free accounts blocked from Marketplace
  if (tierInfo.subscription_status === 'free') {
    return tierRequiredResponse('marketplace_list')
  }
  // Pro accounts + attorney owners: cap at 1 active listing
  // Attorney who owns this patent can list — collaborator-on-someone-else's is blocked by owner check above
  // complimentary: skips cap check entirely (unlimited listings)
  if (tierInfo.subscription_status === 'pro' || tierInfo.is_attorney) {
    const { count: activeListings } = await supabaseService
      .from('patents')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('arc3_active', true)
    if ((activeListings ?? 0) >= 1) {
      return marketplaceLimitResponse()
    }
  }
  // complimentary: unlimited listings — no cap check

  // Check for existing agreement
  const { data: existing } = await supabaseService
    .from('agency_agreements')
    .select('id')
    .eq('patent_id', patentId)
    .eq('is_active', true)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Arc 3 already active for this patent' }, { status: 409 })
  }

  // Generate slug if not set
  let slug = patent.slug
  if (!slug) {
    const baseSlug = slugify(patent.title)
    // Check uniqueness
    const { data: existing } = await supabaseService
      .from('patents')
      .select('id')
      .eq('slug', baseSlug)
      .single()
    slug = existing ? `${baseSlug}-${patentId.slice(0, 6)}` : baseSlug
  }

  // Write agency agreement
  const { data: agreement, error: agErr } = await supabaseService
    .from('agency_agreements')
    .insert({
      patent_id: patentId,
      owner_id: user.id,
      ip_address: ip_address ?? null,
      commission_pct,
      terms_version: 'v1',
      is_active: true,
    })
    .select('id')
    .single()

  if (agErr) return NextResponse.json({ error: agErr.message }, { status: 500 })

  // Activate arc3 on patent + set slug + licensing options
  await supabaseService
    .from('patents')
    .update({
      arc3_active: true,
      slug,
      licensing_exclusive,
      licensing_nonexclusive,
      licensing_field_of_use,
      updated_at: new Date().toISOString(),
    })
    .eq('id', patentId)

  return NextResponse.json({
    ok: true,
    agreement_id: agreement?.id,
    slug,
    deal_page_url: `${process.env.NEXT_PUBLIC_APP_URL}/patents/${slug}`,
  })
}
