import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
}

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Stripe Price IDs — set in Vercel env vars
// STRIPE_PRO_MONTHLY_PRICE_ID  → $149/mo
// STRIPE_PRO_ANNUAL_PRICE_ID   → $1,290/yr
function getPriceId(interval: 'monthly' | 'annual'): string {
  if (interval === 'annual') {
    const id = process.env.STRIPE_PRO_ANNUAL_PRICE_ID
    if (!id) throw new Error('STRIPE_PRO_ANNUAL_PRICE_ID not configured')
    return id
  }
  const id = process.env.STRIPE_PRO_MONTHLY_PRICE_ID
  if (!id) throw new Error('STRIPE_PRO_MONTHLY_PRICE_ID not configured')
  return id
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe()

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const interval: 'monthly' | 'annual' = body.interval === 'annual' ? 'annual' : 'monthly'

    // Fetch or create Stripe customer
    const { data: profile } = await supabaseService
      .from('patent_profiles')
      .select('stripe_customer_id, email, full_name, subscription_status')
      .eq('id', user.id)
      .single()

    if (profile?.subscription_status === 'pro') {
      return NextResponse.json({ error: 'Already subscribed to Pro' }, { status: 409 })
    }

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      await supabaseService
        .from('patent_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const priceId = getPriceId(interval)

    const returnPatentId = body.return_patent_id as string | undefined
    const successBase = returnPatentId
      ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/patents/${returnPatentId}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { user_id: user.id },
      },
      metadata: { user_id: user.id, plan: `pro_${interval}` },
      success_url: `${successBase}?upgrade=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?upgrade=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[billing/create-checkout]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
