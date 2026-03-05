import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
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
  // ── Signature verification ───────────────────────────────────────────────
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

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const { intake_session_id, user_id } = session.metadata ?? {}

  if (!intake_session_id || !user_id) {
    console.error('[webhook] missing metadata on session:', session.id)
    return NextResponse.json({ received: true })
  }

  // ── Await sync DB operations before responding ───────────────────────────
  // These must complete before we return 200 so data is consistent.
  // Target: < 3s total. Gemini claims draft is deferred via after().
  let patentId: string | null = null

  try {
    // Step 1: Mark intake as paid
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
      return NextResponse.json({ received: true })
    }

    // Step 2: Upsert patent_profile (patents.owner_id FK requires this)
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
      return NextResponse.json({ received: true })
    }

    // Step 3: Create patents row
    const { data: patent, error: patentErr } = await supabase
      .from('patents')
      .insert({
        owner_id: profile.id,
        intake_session_id: intake.id,
        title: intake.invention_name || 'Untitled Invention',
        description: [
          intake.problem_solved,
          intake.how_it_works,
          intake.what_makes_it_new,
        ].filter(Boolean).join('\n\n'),
        inventors: [intake.inventor_name, ...(intake.co_inventors ?? [])].filter(Boolean),
        stripe_checkout_session_id: intake.stripe_checkout_session_id,
        payment_confirmed_at: new Date().toISOString(),
        filing_status: 'draft',
        status: 'provisional',
      })
      .select('id')
      .single()

    if (patentErr || !patent) {
      console.error('[webhook] failed to create patent:', patentErr)
      return NextResponse.json({ received: true })
    }

    patentId = patent.id

    // Step 4: Link intake → patent
    await supabase
      .from('patent_intake_sessions')
      .update({ converted_to_patent_id: patent.id, status: 'completed' })
      .eq('id', intake_session_id)

    // Step 5: Defer claims draft via after() — runs post-response, keeps function alive
    after(async () => {
      try {
        await generateClaimsDraft(patent.id, intake)
        console.log('[webhook] claims draft complete for patent:', patent.id)
      } catch (err) {
        console.error('[webhook] claims draft failed:', err)
      }
    })

  } catch (err) {
    console.error('[webhook] unexpected error:', err)
  }

  // ── Respond 200 to Stripe ────────────────────────────────────────────────
  return NextResponse.json({ received: true, patent_id: patentId })
}
