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

/**
 * Update patent_profiles subscription fields for a user.
 */
async function updateSubscription(
  userId: string,
  status: 'free' | 'pro' | 'cancelled',
  periodEnd: Date | null
) {
  await supabase
    .from('patent_profiles')
    .update({
      subscription_status: status,
      subscription_period_end: periodEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
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
