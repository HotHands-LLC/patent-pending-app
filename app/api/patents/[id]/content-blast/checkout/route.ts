import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth — inside handler ─────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )

  // ── Verify ownership ──────────────────────────────────────────────────────
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, title, content_blast_purchased_at')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Idempotent — already purchased ───────────────────────────────────────
  if (patent.content_blast_purchased_at) {
    return NextResponse.json({ alreadyPurchased: true })
  }

  // ── isPro check ───────────────────────────────────────────────────────────
  const { data: profile } = await supabaseService
    .from('patent_profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  const subStatus = profile?.subscription_status ?? 'free'
  if (subStatus !== 'pro' && subStatus !== 'complimentary') {
    return NextResponse.json(
      { error: 'upgrade_required', message: 'Content Blast requires a Pro subscription.' },
      { status: 403 }
    )
  }

  // ── Create Stripe checkout session — inside handler ───────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? ''
  const stripe = new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' })

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: 1200,
          product_data: {
            name: 'Content Blast',
            description: `Generate 7 days of inventor content for "${patent.title}"`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      patent_id: patentId,
      user_id: user.id,
      type: 'content_blast',
    },
    success_url: `${origin}/dashboard/patents/${patentId}?blast=paid`,
    cancel_url: `${origin}/dashboard/patents/${patentId}`,
  })

  return NextResponse.json({ url: session.url })
}
