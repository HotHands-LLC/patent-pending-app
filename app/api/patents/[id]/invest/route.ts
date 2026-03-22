import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const MIN_CENTS = 2500   // $25 minimum
const MAX_CENTS = 1000000 // $10,000 maximum

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
}

/**
 * POST /api/patents/[id]/invest
 * Auth: any authenticated user (not the patent owner)
 * Body: { amount_cents: number }
 *
 * Creates a Stripe Checkout session for a patent investment.
 * On completion, the stripe-billing webhook inserts the patent_investments row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServiceClient()

  // ── Fetch patent ──────────────────────────────────────────────────────────
  const { data: patent, error: patentErr } = await supabase
    .from('patents')
    .select('id, owner_id, title, slug, stage, investment_open, funding_goal_usd, total_raised_usd, rev_share_available_pct')
    .eq('id', patentId)
    .single()

  if (patentErr || !patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (!patent.investment_open) return NextResponse.json({ error: 'Investment is not open for this patent' }, { status: 400 })
  if (patent.owner_id === user.id) return NextResponse.json({ error: 'Owners cannot invest in their own patent' }, { status: 400 })

  // ── Parse + validate amount ───────────────────────────────────────────────
  let body: { amount_cents?: number } = {}
  try { body = await req.json() } catch { /* empty body */ }

  const amountCents = Math.round(body.amount_cents ?? 0)
  if (amountCents < MIN_CENTS) {
    return NextResponse.json({ error: `Minimum investment is $${MIN_CENTS / 100}` }, { status: 400 })
  }
  if (amountCents > MAX_CENTS) {
    return NextResponse.json({ error: `Maximum investment is $${MAX_CENTS / 100} per patent` }, { status: 400 })
  }

  // ── Check per-investor cap ($10k total across all investments in this patent) ──
  const { data: existing } = await supabase
    .from('patent_investments')
    .select('amount_usd')
    .eq('patent_id', patentId)
    .eq('investor_user_id', user.id)
    .eq('status', 'confirmed')

  const alreadyInvested = (existing ?? []).reduce((sum, r) => sum + (r.amount_usd ?? 0), 0)
  if (alreadyInvested + amountCents > MAX_CENTS) {
    const remaining = MAX_CENTS - alreadyInvested
    return NextResponse.json({
      error: `You've already invested $${alreadyInvested / 100}. Remaining cap: $${remaining / 100}`,
    }, { status: 400 })
  }

  // ── Create Stripe Checkout session ────────────────────────────────────────
  const stripe = getStripe()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  const slug   = patent.slug ?? patentId

  const stageLabel: Record<string, string> = {
    provisional: 'Provisional', non_provisional: 'Non-Provisional',
    development: 'Development', licensing: 'Licensing', granted: 'Granted',
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: {
          name: `Investment — ${patent.title}`,
          description: `Revenue share stake in ${patent.title} (${stageLabel[patent.stage ?? ''] ?? patent.stage} stage)`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      type:               'patent_investment',
      patent_id:          patentId,
      investor_user_id:   user.id,
      amount_usd:         String(amountCents),
      stage:              patent.stage ?? 'provisional',
      funding_goal_usd:   String(patent.funding_goal_usd ?? 0),
      rev_share_available_pct: String(patent.rev_share_available_pct ?? 0),
    },
    success_url: `${origin}/patents/${slug}?invested=true`,
    cancel_url:  `${origin}/patents/${slug}`,
  })

  return NextResponse.json({ url: session.url, session_id: session.id })
}
