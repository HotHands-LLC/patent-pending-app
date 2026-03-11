import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Tier mapping ─────────────────────────────────────────────────────────────
// Maps Stripe subscription.status → internal patent_profiles.subscription_status
// past_due is kept as 'pro' — grace period, do not downgrade mid-cycle
function stripeTierFromStatus(stripeStatus: string): 'pro' | 'free' {
  if (stripeStatus === 'active' || stripeStatus === 'past_due') return 'pro'
  // canceled, unpaid, incomplete_expired, incomplete, trialing (edge case) → free
  return 'free'
}

// ── Subscription updated ─────────────────────────────────────────────────────
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id

  const newTier = stripeTierFromStatus(subscription.status)
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null

  const { data, error } = await supabase
    .from('patent_profiles')
    .update({
      subscription_status: newTier,
      subscription_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId)
    .select('id, email')
    .single()

  if (error) {
    console.error('[webhook/sub.updated] profile update failed:', JSON.stringify(error), 'customer:', customerId)
    return
  }
  console.log(`[webhook/sub.updated] user ${data?.email ?? data?.id} → ${newTier} (stripe: ${subscription.status})`)
}

// ── Subscription deleted ─────────────────────────────────────────────────────
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id

  const { data, error } = await supabase
    .from('patent_profiles')
    .update({
      subscription_status: 'free',
      subscription_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId)
    .select('id, email')
    .single()

  if (error) {
    console.error('[webhook/sub.deleted] profile update failed:', JSON.stringify(error), 'customer:', customerId)
    return
  }
  console.log(`[webhook/sub.deleted] user ${data?.email ?? data?.id} → free (subscription cancelled)`)
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 401 })
  }

  // 1. Read raw body — required for Stripe signature verification
  const rawBody = await req.text()
  const stripe = getStripe()

  // 2. Verify signature using raw string
  try {
    stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed'
    console.error('[webhook] sig verification failed:', msg)
    return NextResponse.json({ error: `Webhook signature failed: ${msg}` }, { status: 401 })
  }

  // 3. Parse event from raw body
  const event = JSON.parse(rawBody) as Stripe.Event

  // ── Route by event type ───────────────────────────────────────────────────
  if (event.type === 'customer.subscription.updated') {
    await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
    return NextResponse.json({ received: true })
  }

  if (event.type === 'customer.subscription.deleted') {
    await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
    return NextResponse.json({ received: true })
  }

  // ── checkout.session.completed — unchanged ────────────────────────────────
  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const { intake_session_id, user_id } = session.metadata ?? {}

  if (!intake_session_id || !user_id) {
    console.error('[webhook] missing metadata — session:', session.id)
    return NextResponse.json({ received: true })
  }

  let patentId: string | null = null

  try {
    // Step 1: Mark intake as paid
    const { data: intake, error: intakeErr } = await supabase
      .from('patent_intake_sessions')
      .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', intake_session_id)
      .select('*')
      .single()

    if (intakeErr || !intake) {
      console.error('[webhook] Step 1 failed — intake update:', JSON.stringify(intakeErr))
      return NextResponse.json({ error: 'intake update failed', detail: intakeErr }, { status: 500 })
    }
    console.log('[webhook] Step 1 OK — intake marked paid:', intake_session_id)

    // Step 2: Upsert patent_profile (patents.owner_id FK requires this)
    const { data: profile, error: profileErr } = await supabase
      .from('patent_profiles')
      .upsert(
        { id: user_id, email: intake.inventor_email ?? null, full_name: intake.inventor_name ?? null },
        { onConflict: 'id' }
      )
      .select('id')
      .single()

    if (profileErr || !profile) {
      console.error('[webhook] Step 2 failed — profile upsert:', JSON.stringify(profileErr))
      return NextResponse.json({ error: 'profile upsert failed', detail: profileErr }, { status: 500 })
    }
    console.log('[webhook] Step 2 OK — profile:', profile.id)

    // Step 3: Create patents row — claims_status='pending' enqueues cron job
    const { data: patent, error: patentErr } = await supabase
      .from('patents')
      .insert({
        owner_id: profile.id,
        intake_session_id: intake.id,
        title: intake.invention_name || 'Untitled Invention',
        description: [intake.problem_solved, intake.how_it_works, intake.what_makes_it_new]
          .filter(Boolean).join('\n\n'),
        inventors: [intake.inventor_name, ...(intake.co_inventors ?? [])].filter(Boolean),
        stripe_checkout_session_id: intake.stripe_checkout_session_id,
        payment_confirmed_at: new Date().toISOString(),
        filing_status: 'draft',
        status: 'provisional',
        claims_status: 'pending', // ← Picked up by /api/cron/generate-claims within 60s
      })
      .select('id')
      .single()

    if (patentErr || !patent) {
      console.error('[webhook] Step 3 failed — patent insert:', JSON.stringify(patentErr))
      return NextResponse.json({ error: 'patent insert failed', detail: patentErr }, { status: 500 })
    }
    console.log('[webhook] Step 3 OK — patent created with claims_status=pending:', patent.id)
    patentId = patent.id

    // Step 4: Link intake → patent
    await supabase
      .from('patent_intake_sessions')
      .update({ converted_to_patent_id: patent.id, status: 'completed' })
      .eq('id', intake_session_id)
    console.log('[webhook] Step 4 OK — intake linked, webhook complete in <2s')

    // NOTE: Gemini claims generation is intentionally removed from webhook.
    // The cron job at /api/cron/generate-claims picks up claims_status='pending'
    // rows every 60s — no timeout risk.

  } catch (err) {
    console.error('[webhook] unexpected error:', err)
    return NextResponse.json({ error: 'internal error', detail: String(err) }, { status: 500 })
  }

  return NextResponse.json({ received: true, patent_id: patentId })
}
