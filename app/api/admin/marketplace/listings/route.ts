/**
 * GET /api/admin/marketplace/listings
 * Admin-only: returns all marketplace_listings and marketplace_offers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifyAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseService
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return { userId: user.id }
}

export async function GET(req: NextRequest) {
  const authResult = await verifyAdmin(req)
  if (authResult instanceof NextResponse) return authResult

  // Fetch all listings
  const { data: listings, error: listingsErr } = await supabaseService
    .from('marketplace_listings')
    .select('id, title, tech_category, patent_status, listing_type, asking_price_usd, status, featured, view_count, listed_at, created_at')
    .order('created_at', { ascending: false })

  if (listingsErr) {
    console.error('[admin/marketplace/listings] listings error:', listingsErr)
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
  }

  // Fetch all offers, join listing title
  const { data: offersRaw, error: offersErr } = await supabaseService
    .from('marketplace_offers')
    .select('id, listing_id, buyer_name, buyer_email, buyer_company, offer_type, offer_amount_usd, message, status, pp_app_fee_pct, created_at')
    .order('created_at', { ascending: false })

  if (offersErr) {
    console.error('[admin/marketplace/listings] offers error:', offersErr)
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
  }

  // Enrich offers with listing titles
  const listingMap = new Map((listings ?? []).map(l => [l.id, l.title]))
  const offers = (offersRaw ?? []).map(o => ({
    ...o,
    listing_title: listingMap.get(o.listing_id) ?? null,
  }))

  return NextResponse.json({ listings: listings ?? [], offers })
}
