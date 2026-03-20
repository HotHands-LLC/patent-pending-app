'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttorneyPartner {
  id: string
  firm_name: string | null
  referral_code: string
  referral_url: string | null
  status: string
  revenue_share_pct: number
  payout_email: string | null
  created_at: string
}

interface ReferralAttribution {
  id: string
  partner_id: string
  referred_user_id: string | null
  referral_code: string
  converted_at: string | null
  first_paid_at: string | null
  created_at: string
}

interface RevenueEvent {
  id: string
  event_type: 'pro_subscription' | 'marketplace_transaction'
  gross_amount_cents: number
  commission_pct: number
  commission_cents: number
  payout_status: 'pending' | 'paid' | 'voided'
  stripe_payment_intent_id: string | null
  created_at: string
}

interface ReferredUser {
  id: string
  obfuscated_email: string
  signup_date: string
  is_paid: boolean
  first_paid_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

// ── Payout badge ──────────────────────────────────────────────────────────────

function PayoutBadge({ status }: { status: 'pending' | 'paid' | 'voided' }) {
  const classes = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    voided: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${classes[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PartnerDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState<AttorneyPartner | null>(null)
  const [attributions, setAttributions] = useState<ReferralAttribution[]>([])
  const [revenueEvents, setRevenueEvents] = useState<RevenueEvent[]>([])
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([])
  const [copied, setCopied] = useState(false)
  const [accessToken, setAccessToken] = useState('')

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { router.push('/login'); return }
    setAccessToken(session.access_token)

    // Fetch partner record (RLS-filtered by user_id)
    const { data: partnerData } = await supabase
      .from('attorney_partners')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .single()

    if (!partnerData) {
      // Not a partner — redirect to /partners page
      router.push('/partners')
      return
    }

    setPartner(partnerData)

    // Fetch attributions
    const { data: attrData } = await supabase
      .from('referral_attributions')
      .select('*')
      .eq('partner_id', partnerData.id)
      .order('created_at', { ascending: false })

    setAttributions(attrData ?? [])

    // Fetch revenue events
    const { data: revenueData } = await supabase
      .from('partner_revenue_events')
      .select('*')
      .eq('partner_id', partnerData.id)
      .order('created_at', { ascending: false })

    setRevenueEvents(revenueData ?? [])

    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  // Fetch referred users (obfuscated emails, via service route)
  useEffect(() => {
    if (!accessToken || !partner) return
    fetch('/api/dashboard/partner/referred-users', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(d => { if (d.users) setReferredUsers(d.users) })
      .catch(() => {})
  }, [accessToken, partner])

  function copyReferralLink() {
    if (!partner) return
    const url = `https://patentpending.app/?ref=${partner.referral_code}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalReferred = attributions.length
  const convertedToPaid = attributions.filter(a => !!a.first_paid_at).length
  const pendingCommission = revenueEvents
    .filter(e => e.payout_status === 'pending')
    .reduce((sum, e) => sum + e.commission_cents, 0)
  const paidCommission = revenueEvents
    .filter(e => e.payout_status === 'paid')
    .reduce((sum, e) => sum + e.commission_cents, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!partner) return null

  const referralUrl = `https://patentpending.app/?ref=${partner.referral_code}`

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Partner Dashboard</h1>
          <span className="text-xs font-mono bg-[#1a1f36] text-[#f5a623] px-2.5 py-1 rounded-full font-semibold tracking-wide">
            {partner.referral_code}
          </span>
          {partner.firm_name && (
            <span className="text-sm text-gray-500">{partner.firm_name}</span>
          )}
        </div>

        {/* ── Referral link card ────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">Your referral link</p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="flex-1 min-w-0 text-sm bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-700 break-all">
              {referralUrl}
            </code>
            <button
              onClick={copyReferralLink}
              className="shrink-0 px-4 py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] transition-colors min-w-[110px] text-center"
            >
              {copied ? '✅ Copied!' : 'Copy link'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Share this link with inventor clients. They&apos;ll get credit to your account automatically.
          </p>
        </div>

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Referred users" value={totalReferred} />
          <StatCard label="Converted to paid" value={convertedToPaid} />
          <StatCard label="Pending commission" value={formatCents(pendingCommission)} />
          <StatCard label="Paid commission" value={formatCents(paidCommission)} />
        </div>

        {/* ── Referred users ────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Referred users</h2>
          {referredUsers.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No referred users yet. Share your referral link to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {referredUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{u.obfuscated_email}</p>
                    <p className="text-xs text-gray-400">Signed up {formatDate(u.signup_date)}</p>
                  </div>
                  <span className={`text-sm ${u.is_paid ? 'text-green-600' : 'text-gray-400'}`}>
                    {u.is_paid ? '✅ Paid' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Revenue events ────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Commission history</h2>
          {revenueEvents.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No revenue events yet. Commissions appear here when referred users upgrade to Pro.
            </p>
          ) : (
            <div className="space-y-3">
              {revenueEvents.map(e => (
                <div key={e.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {e.event_type === 'pro_subscription' ? 'Pro Subscription' : 'Marketplace'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(e.created_at)} · Gross {formatCents(e.gross_amount_cents)} · {e.commission_pct}% commission
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCents(e.commission_cents)}</p>
                    <PayoutBadge status={e.payout_status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Payout info ───────────────────────────────────────────────────── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-6">
          <p className="text-sm text-blue-800 leading-relaxed">
            <strong>Payout info:</strong> Commissions are paid monthly via PayPal, Venmo, or ACH.
            Minimum payout: $50. Contact{' '}
            <a href="mailto:support@patentpending.app" className="underline hover:text-blue-900">
              support@patentpending.app
            </a>{' '}
            to set up your payout method.
          </p>
        </div>

        {/* ── Back link ─────────────────────────────────────────────────────── */}
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
