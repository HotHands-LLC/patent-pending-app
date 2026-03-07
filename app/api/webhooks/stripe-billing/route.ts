import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail, FROM_DEFAULT } from '@/lib/email'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Update patent_profiles subscription fields for a user.
 */
async function updateSubscription(
  userId: string,
  status: 'free' | 'pro' | 'cancelled',
  periodEnd: Date | null
) {
  const { error } = await supabase
    .from('patent_profiles')
    .update({
      subscription_status: status,
      subscription_period_end: periodEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (error) throw new Error(`updateSubscription failed for ${userId}: ${error.message}`)
}

/** Fire welcome email once on first Pro upgrade */
async function maybeSendWelcomeEmail(userId: string) {
  const { data: profile } = await supabase
    .from('patent_profiles')
    .select('email, full_name, pro_welcome_sent')
    .eq('id', userId)
    .single()
  if (!profile?.email || profile.pro_welcome_sent) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  try {
    await sendEmail(buildEmail({
      to: profile.email,
      from: FROM_DEFAULT,
      subject: "Welcome to Pro — you're all set ✅",
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">You're now on PatentPending Pro 🎉</h2>
  <p>Hi ${profile.full_name?.split(' ')[0] ?? 'there'},</p>
  <p>Your Pro subscription is active. Here's what you now have access to:</p>
  <ul>
    <li><strong>Deep Research Pass</strong> — 12-minute Gemini analysis strengthens claims with prior art</li>
    <li><strong>Claude Refinement Pass</strong> — USPTO-precision language polish on your claims</li>
    <li><strong>Unlimited revision rounds</strong> — iterate as many times as you need</li>
    <li><strong>AI Figure Generation</strong> — USPTO-style technical drawings from your spec</li>
  </ul>
  <p>All of these are available directly from each patent's Claims tab.</p>
  <p><a href="${appUrl}/dashboard/patents" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Go to my patents →</a></p>
</div>`,
    }))
    // Mark as sent
    await supabase
      .from('patent_profiles')
      .update({ pro_welcome_sent: true, updated_at: new Date().toISOString() })
      .eq('id', userId)
    console.log('[stripe-billing] welcome email sent to:', profile.email)
  } catch (err) {
    console.error('[stripe-billing] welcome email failed (non-fatal):', err)
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 401 })
  }

  const rawBody = await req.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_BILLING_WEBHOOK_SECRET!
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed'
    console.error('[stripe-billing webhook] sig error:', msg)
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  console.log('[stripe-billing webhook] event:', event.type)

  try {
    switch (event.type) {
      /**
       * Checkout completed → mark user as Pro
       * This fires when a NEW subscription is created via checkout.
       */
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const userId = session.metadata?.user_id
        if (!userId) { console.error('[stripe-billing] no user_id in metadata'); break }

        // Retrieve subscription to get period_end
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        const periodEnd = new Date(sub.current_period_end * 1000)

        await updateSubscription(userId, 'pro', periodEnd)
        console.log('[stripe-billing] upgraded user to pro:', userId, 'until', periodEnd.toISOString())
        // Fire welcome email (once per user, non-blocking)
        maybeSendWelcomeEmail(userId).catch(console.error)
        break
      }

      /**
       * Subscription updated — handles renewals and plan changes
       */
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.user_id

        if (!userId) {
          // Try to find via customer ID
          const { data: profile } = await supabase
            .from('patent_profiles')
            .select('id')
            .eq('stripe_customer_id', sub.customer as string)
            .single()
          if (!profile?.id) { console.error('[stripe-billing] user not found for customer:', sub.customer); break }

          const periodEnd = new Date(sub.current_period_end * 1000)
          const status = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free'
          await updateSubscription(profile.id, status, periodEnd)
          console.log('[stripe-billing] subscription updated for profile:', profile.id, status)
          break
        }

        const periodEnd = new Date(sub.current_period_end * 1000)
        const status = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free'
        await updateSubscription(userId, status, periodEnd)
        console.log('[stripe-billing] subscription updated:', userId, status)
        break
      }

      /**
       * Subscription deleted — downgrade to free
       */
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.user_id

        if (!userId) {
          const { data: profile } = await supabase
            .from('patent_profiles')
            .select('id')
            .eq('stripe_customer_id', sub.customer as string)
            .single()
          if (profile?.id) await updateSubscription(profile.id, 'cancelled', null)
          break
        }

        await updateSubscription(userId, 'cancelled', null)
        console.log('[stripe-billing] subscription cancelled for user:', userId)
        break
      }

      /**
       * Invoice payment succeeded — renew period_end on each billing cycle
       */
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const userId = sub.metadata?.user_id

        if (!userId) {
          const { data: profile } = await supabase
            .from('patent_profiles')
            .select('id')
            .eq('stripe_customer_id', invoice.customer as string)
            .single()
          if (profile?.id) {
            const periodEnd = new Date(sub.current_period_end * 1000)
            await updateSubscription(profile.id, 'pro', periodEnd)
          }
          break
        }

        const periodEnd = new Date(sub.current_period_end * 1000)
        await updateSubscription(userId, 'pro', periodEnd)
        console.log('[stripe-billing] invoice paid, renewed period for:', userId)
        break
      }

      /**
       * Invoice payment failed — optionally downgrade or just log
       */
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.warn('[stripe-billing] payment failed for customer:', invoice.customer)
        // Don't immediately downgrade — Stripe retries. Subscription will delete if retries exhaust.
        break
      }

      default:
        console.log('[stripe-billing] unhandled event type:', event.type)
    }
  } catch (err) {
    console.error('[stripe-billing] handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
