/**
 * POST /api/marketplace/offer — Submit an offer/inquiry for a marketplace listing
 *
 * Public, no auth required.
 * Saves to marketplace_offers table. Rate-limited: 5/hour per IP.
 * pp.app takes 12% transaction fee (tracked in offers table).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_OFFER_TYPES = ['license', 'acquire', 'partner', 'invest', 'inquiry'] as const

// ── Rate limiting (per-IP, 5/hour) ────────────────────────────────────────────
const rateMap = new Map<string, number[]>()
const RATE_LIMIT = 5
const RATE_WINDOW = 60 * 60 * 1000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return true
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests — please try again later.' },
      { status: 429 }
    )
  }

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    listing_id,
    buyer_name,
    buyer_email,
    buyer_company,
    offer_type,
    offer_amount_usd,
    message,
  } = body

  // Validate required fields
  if (!listing_id || typeof listing_id !== 'string') {
    return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
  }
  if (!buyer_name || typeof buyer_name !== 'string' || buyer_name.trim().length < 2) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  }
  if (!buyer_email || typeof buyer_email !== 'string' || !buyer_email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!offer_type || !VALID_OFFER_TYPES.includes(offer_type as typeof VALID_OFFER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid offer type' }, { status: 400 })
  }
  if (!message || typeof message !== 'string' || message.trim().length < 10) {
    return NextResponse.json({ error: 'Message is required (min 10 characters)' }, { status: 400 })
  }

  // Verify listing exists and is active
  const { data: listing, error: listingErr } = await supabaseService
    .from('marketplace_listings')
    .select('id, title, status')
    .eq('id', listing_id)
    .eq('status', 'active')
    .single()

  if (listingErr || !listing) {
    return NextResponse.json({ error: 'Listing not found or no longer active' }, { status: 404 })
  }

  // Clean inputs
  const cleanName    = buyer_name.trim().slice(0, 100)
  const cleanEmail   = buyer_email.trim().toLowerCase().slice(0, 200)
  const cleanCompany = buyer_company && typeof buyer_company === 'string' ? buyer_company.trim().slice(0, 100) : null
  const cleanMessage = message.trim().slice(0, 2000)
  const cleanAmount  = offer_amount_usd && typeof offer_amount_usd === 'number' && offer_amount_usd > 0
    ? Math.round(offer_amount_usd)
    : null

  // Insert offer
  const { data: offer, error: insertErr } = await supabaseService
    .from('marketplace_offers')
    .insert({
      listing_id,
      buyer_name:      cleanName,
      buyer_email:     cleanEmail,
      buyer_company:   cleanCompany,
      offer_type:      offer_type as string,
      offer_amount_usd: cleanAmount,
      message:         cleanMessage,
      status:          'pending',
      pp_app_fee_pct:  12.0,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[marketplace/offer] insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to save inquiry. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    offer_id: offer.id,
    message: "Your inquiry has been received. We'll be in touch within 2 business days.",
  })
}
