import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { generateClaimsDraft } from '@/lib/claims-draft'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/webhooks/stripe
// Stripe sends checkout.session.completed here
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 401 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    // Signature verification failed — reject immediately
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Only handle checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const { intake_session_id, user_id } = session.metadata || {}

  if (!intake_session_id || !user_id) {
    console.error('Webhook missing metadata:', session.id)
    return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
  }

  // 1. Mark intake as paid — respond 200 immediately, don't block
  const now = new Date().toISOString()

  const { data: intake } = await supabase
    .from('patent_intake_sessions')
    .update({
      payment_status: 'paid',
      stripe_checkout_session_id: session.id,
    })
    .eq('id', intake_session_id)
    .select('*')
    .single()

  if (!intake) {
    console.error('Intake session not found for webhook:', intake_session_id)
    return NextResponse.json({ error: 'Intake not found' }, { status: 404 })
  }

  // 2. Convert intake → patents row
  // Look up patent_profile id for this user (patents.owner_id → patent_profiles.id)
  const { data: profile } = await supabase
    .from('patent_profiles')
    .select('id')
    .eq('id', user_id)
    .single()

  const owner_id = profile?.id || user_id

  const { data: patent, error: patentErr } = await supabase
    .from('patents')
    .insert({
      owner_id,
      intake_session_id,
      title: intake.invention_name || 'Untitled Invention',
      description: [
        intake.problem_solved,
        intake.how_it_works,
        intake.what_makes_it_new,
      ].filter(Boolean).join('\n\n'),
      inventors: intake.inventor_name
        ? [intake.inventor_name, ...(intake.co_inventors || [])].filter(Boolean)
        : [],
      status: 'provisional',
      filing_status: 'draft',
      payment_confirmed_at: now,
      stripe_checkout_session_id: session.id,
    })
    .select('id')
    .single()

  if (patentErr || !patent) {
    console.error('Failed to create patent from intake:', patentErr)
    return NextResponse.json({ error: 'Patent creation failed' }, { status: 500 })
  }

  // Link converted patent back to intake session
  await supabase
    .from('patent_intake_sessions')
    .update({ converted_to_patent_id: patent.id, status: 'completed' })
    .eq('id', intake_session_id)

  // 3. Respond 200 to Stripe immediately
  // Fire claims draft job async (non-blocking)
  generateClaimsDraft(patent.id, intake).catch((err) => {
    console.error('Claims draft job failed:', err)
  })

  return NextResponse.json({ received: true })
}
