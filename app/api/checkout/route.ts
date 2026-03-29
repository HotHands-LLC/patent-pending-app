import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Lazy init — avoids build-time crash when env vars not yet set
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
}

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Price in cents — configurable via env var, default $49
const PRICE_CENTS = parseInt(process.env.CLAIMS_PRICE_CENTS || '4900', 10)

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe()
    const { intake_session_id } = await req.json()
    if (!intake_session_id) {
      return NextResponse.json({ error: 'intake_session_id required' }, { status: 400 })
    }

    // Verify session exists and belongs to authenticated user
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

    // Fetch intake session
    const { data: session, error: sessionErr } = await supabaseService
      .from('patent_intake_sessions')
      .select('id, invention_name, payment_status, owner_id')
      .eq('id', intake_session_id)
      .eq('owner_id', user.id)
      .single()

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Intake session not found' }, { status: 404 })
    }
    if (session.payment_status === 'paid') {
      return NextResponse.json({ error: 'Already paid' }, { status: 409 })
    }

    // Create Stripe Checkout session
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: PRICE_CENTS,
          product_data: {
            name: 'Patent Claims Draft — Full Filing Package',
            description: `AI-generated claims draft, spec outline, and USPTO filing guidance for: ${session.invention_name || 'your invention'}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        intake_session_id: session.id,
        user_id: user.id,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/intake/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/intake/new`,
    })

    // Store checkout session ID on intake record
    await supabaseService
      .from('patent_intake_sessions')
      .update({ stripe_checkout_session_id: checkout.id })
      .eq('id', intake_session_id)

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
