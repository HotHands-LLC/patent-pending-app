import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Lazy init — STRIPE_SECRET_KEY not available at build time
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })
}

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function userClient(jwt: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
}

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null
}

// POST /api/checkout
// Body: { intake_session_id: string }
// Returns: { url: string } — Stripe Checkout hosted URL
export async function POST(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = userClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { intake_session_id } = await req.json()
    if (!intake_session_id) {
      return NextResponse.json({ error: 'intake_session_id required' }, { status: 400 })
    }

    // Verify intake session belongs to this user
    const { data: intake, error: intakeErr } = await supabase
      .from('patent_intake_sessions')
      .select('id, invention_name, payment_status')
      .eq('id', intake_session_id)
      .eq('owner_id', user.id)
      .single()

    if (intakeErr || !intake) {
      return NextResponse.json({ error: 'Intake session not found' }, { status: 404 })
    }

    if (intake.payment_status === 'paid') {
      return NextResponse.json({ error: 'Already paid' }, { status: 409 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://patentpending.app'

    // Create Stripe Checkout session
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PatentPending.app — Claims Draft & Filing Package',
              description: `AI-generated claims draft, spec outline, and USPTO filing package for: ${intake.invention_name || 'your invention'}`,
            },
            unit_amount: 4900, // $49.00 — configurable
          },
          quantity: 1,
        },
      ],
      metadata: {
        intake_session_id,
        user_id: user.id,
      },
      success_url: `${appUrl}/intake/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/intake/new`,
    })

    // Store checkout session ID on intake record
    await supabaseService
      .from('patent_intake_sessions')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', intake_session_id)

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Checkout error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
