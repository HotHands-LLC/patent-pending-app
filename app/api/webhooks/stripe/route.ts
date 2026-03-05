import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { generateClaimsDraft } from '@/lib/claims-draft'

// Lazy init — avoids build-time crash when env vars not yet set
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// App Router: req.text() reads raw body directly — no bodyParser config needed

export async function POST(req: NextRequest) {
  // ── Signature verification — MUST pass before processing anything ────────
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 401 })
  }

  const stripe = getStripe()
  const rawBody = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed'
    console.error('[webhook] sig verification failed:', msg)
    return NextResponse.json({ error: `Webhook signature failed: ${msg}` }, { status: 401 })
  }

  // ── Respond 200 immediately — all processing is non-blocking ────────────
  // We process async below, but Stripe gets 200 right away
  handleEvent(event).catch((err) => {
    console.error('[webhook] async handler error:', err)
  })

  return NextResponse.json({ received: true })
}

async function handleEvent(event: Stripe.Event) {
  if (event.type !== 'checkout.session.completed') return

  const session = event.data.object as Stripe.Checkout.Session
  const { intake_session_id, user_id } = session.metadata ?? {}

  if (!intake_session_id || !user_id) {
    console.error('[webhook] missing metadata on session:', session.id)
    return
  }

  // ── Step 1: Mark intake as paid ──────────────────────────────────────────
  const { data: intake, error: intakeErr } = await supabase
    .from('patent_intake_sessions')
    .update({
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    })
    .eq('id', intake_session_id)
    .select('*')
    .single()

  if (intakeErr || !intake) {
    console.error('[webhook] failed to update intake session:', intakeErr)
    return
  }

  // ── Step 2: Convert intake → patents row ─────────────────────────────────
  // Ensure patent_profile exists — upsert so FK never fails.
  // patents.owner_id → patent_profiles.id (FK constraint), so this is mandatory.
  const { data: profile, error: profileErr } = await supabase
    .from('patent_profiles')
    .upsert(
      {
        id: user_id,
        email: intake.inventor_email ?? null,
        full_name: intake.inventor_name ?? null,
      },
      { onConflict: 'id', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (profileErr || !profile) {
    console.error('[webhook] failed to upsert patent_profile:', profileErr)
    return  // Cannot proceed — would get FK violation on patent insert
  }

  const ownerId = profile.id

  const { data: patent, error: patentErr } = await supabase
    .from('patents')
    .insert({
      owner_id: ownerId,
      intake_session_id: intake.id,
      title: intake.invention_name || 'Untitled Invention',
      description: [
        intake.problem_solved,
        intake.how_it_works,
        intake.what_makes_it_new,
      ].filter(Boolean).join('\n\n'),
      inventors: [intake.inventor_name, ...(intake.co_inventors ?? [])]
        .filter(Boolean),
      stripe_checkout_session_id: intake.stripe_checkout_session_id,
      payment_confirmed_at: new Date().toISOString(),
      filing_status: 'draft',
      status: 'provisional',
    })
    .select('id')
    .single()

  if (patentErr || !patent) {
    console.error('[webhook] failed to create patent:', patentErr)
    return
  }

  // Update intake with converted patent id
  await supabase
    .from('patent_intake_sessions')
    .update({ converted_to_patent_id: patent.id, status: 'completed' })
    .eq('id', intake_session_id)

  // ── Step 3: Enqueue claims draft (async — does not block) ────────────────
  generateClaimsDraft(patent.id, intake).catch((err) => {
    console.error('[webhook] claims draft failed:', err)
  })
}
