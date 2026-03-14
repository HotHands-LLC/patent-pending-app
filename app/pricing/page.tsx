'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/components/GoogleAnalytics'

export default function PricingPage() {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function startCheckout(plan: 'pro') {
    setError('')
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login?redirect=/pricing')
        return
      }

      // Recover patent context stored before upgrade redirect
      const returnPatentId = typeof window !== 'undefined'
        ? localStorage.getItem('pp_upgrade_return_patent')
        : null
      if (returnPatentId) localStorage.removeItem('pp_upgrade_return_patent')

      trackEvent('checkout_initiated', { plan, interval })
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan, interval, return_patent_id: returnPatentId ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      window.location.href = data.url
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  const monthlyPrice = 149
  const annualPrice = 1290
  const annualMonthly = Math.round(annualPrice / 12)
  const annualSavings = Math.round(monthlyPrice * 12 - annualPrice)

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#f4f4f5', fontFamily: 'inherit' }}>
      {/* Nav */}
      <div style={{ borderBottom: '1px solid #18181b', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/dashboard" style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5', textDecoration: 'none' }}>⚖️ PatentPending</Link>
        <Link href="/dashboard" style={{ fontSize: 12, color: '#52525b' }}>← Back to Dashboard</Link>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#f4f4f5', margin: '0 0 12px', letterSpacing: '-0.03em' }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontSize: 16, color: '#71717a', margin: 0 }}>
            File your patent with AI-powered help. Upgrade to Pro for unlimited revisions and deep research.
          </p>
        </div>

        {/* Interval toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: 4 }}>
            {(['monthly', 'annual'] as const).map(i => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  background: interval === i ? '#f4f4f5' : 'transparent',
                  color: interval === i ? '#09090b' : '#71717a',
                  transition: 'all 0.15s',
                }}
              >
                {i === 'annual' ? `Annual (save $${annualSavings})` : 'Monthly'}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>

          {/* Free tier */}
          <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 16, padding: '28px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#71717a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Free</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f4f4f5', marginBottom: 4 }}>
              $49 <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>one-time</span>
            </div>
            <p style={{ fontSize: 13, color: '#71717a', marginBottom: 20 }}>Per invention — no subscription.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'AI-generated claims draft',
                'Smart Handoff upload',
                '2 revision rounds per patent',
                'Filing readiness score',
                'Correspondence tracking',
                '9-step filing tracker',
                'Co-inventor invite',
              ].map(f => (
                <li key={f} style={{ fontSize: 13, color: '#d4d4d8', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#059669' }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/intake/new" style={{ display: 'block', padding: '12px', borderRadius: 8, background: '#27272a', color: '#f4f4f5', textAlign: 'center', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Start Free →
            </Link>
          </div>

          {/* Pro tier */}
          <div style={{ background: '#18181b', border: '1px solid rgba(245,158,11,0.5)', borderRadius: 16, padding: '28px 24px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#f59e0b', color: '#1a1a1a', fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 20, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              MOST POPULAR
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>⚡ Pro</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f4f4f5', marginBottom: 4 }}>
              {interval === 'annual'
                ? <>${annualMonthly} <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>/mo · billed annually (${annualPrice}/yr)</span></>
                : <>${monthlyPrice} <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>/month</span></>
              }
            </div>
            <p style={{ fontSize: 13, color: '#71717a', marginBottom: 20 }}>Everything in Free, plus:</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'Deep Research Pass (12 min)',
                'Pattie Polish',
                'Unlimited revision rounds',
                'Prior art search report',
                'Attorney-quality spec drafting',
                'Mission Control access',
              ].map(f => (
                <li key={f} style={{ fontSize: 13, color: '#d4d4d8', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#f59e0b' }}>⚡</span> {f}
                </li>
              ))}
            </ul>

            {error && (
              <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</p>
            )}

            <button
              onClick={() => startCheckout('pro')}
              disabled={loading}
              style={{
                display: 'block',
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                background: loading ? 'rgba(245,158,11,0.4)' : '#f59e0b',
                color: '#1a1a1a',
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Redirecting...' : `Get Pro — ${interval === 'annual' ? `$${annualPrice}/yr` : `$${monthlyPrice}/mo`} →`}
            </button>
          </div>
        </div>

        {/* FAQ / fine print */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#3f3f46', marginBottom: 8 }}>
            Secure checkout via Stripe. Cancel anytime. Annual plan billed upfront.
          </p>
          <p style={{ fontSize: 12, color: '#3f3f46' }}>
            One-time $49 filing fee per patent is separate from the Pro subscription.
          </p>
        </div>
      </div>
    </div>
  )
}
