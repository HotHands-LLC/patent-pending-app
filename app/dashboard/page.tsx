'use client'
/**
 * Dashboard — simplified single-page view
 * Sections: Profile · Patents · Deadlines · Settings
 * No tabs, no heavy chrome, scroll-based.
 * Admin stays at /admin/* — this is purely user-facing.
 */
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase, Patent, getDaysUntil, getUrgencyBadge } from '@/lib/supabase'
import NewPatentModal from '@/components/NewPatentModal'
import PattieIntakeModal from '@/components/PattieIntakeModal'

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserProfile {
  full_name: string | null
  name_first: string | null
  name_last: string | null
  email: string | null
  entity_status: string | null
  subscription_status: string | null
  company: string | null
}

interface Deadline {
  id: string
  patent_id: string
  deadline_type: string
  due_date: string
  status: string
  patents: { title: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function displayName(p: UserProfile): string {
  if (p.name_first || p.name_last) return [p.name_first, p.name_last].filter(Boolean).join(' ')
  return p.full_name || p.email || 'Inventor'
}

function entityLabel(status: string | null): string {
  if (!status) return '—'
  const map: Record<string, string> = {
    micro: 'Micro Entity',
    small: 'Small Entity',
    large: 'Large Entity / Corporation',
  }
  return map[status] ?? status
}

function subLabel(status: string | null): string {
  if (!status || status === 'free') return 'Free'
  if (status === 'pro') return 'Pro'
  if (status === 'complimentary') return 'Complimentary Pro'
  return status
}

function statusStage(p: Patent): string {
  const stage = p.filing_status ?? p.status ?? 'draft'
  const map: Record<string, string> = {
    draft: 'Draft',
    provisional: 'Provisional',
    approved: 'Ready to File',
    provisional_filed: 'Provisional Filed',
    nonprov_pending: 'Non-Prov Pending',
    nonprov_filed: 'Non-Prov Filed',
    non_provisional: 'Non-Provisional',
    published: 'Published',
    granted: 'Granted ✓',
    abandoned: 'Abandoned',
    on_hold: 'On Hold',
    research_import: 'Research Import',
  }
  return map[stage] ?? stage
}

function deadlineBadge(days: number): string {
  if (days <= 0) return 'bg-red-100 text-red-700 font-bold'
  if (days <= 30) return 'bg-red-100 text-red-700'
  if (days <= 90) return 'bg-orange-100 text-orange-700'
  if (days <= 180) return 'bg-yellow-100 text-yellow-700'
  return 'bg-green-100 text-green-600'
}

// ── Section cards ─────────────────────────────────────────────────────────────
function SectionCard({ title, icon, children, action }: {
  title: string
  icon: string
  children: React.ReactNode
  action?: { label: string; href: string }
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h2 className="font-semibold text-[#1a1f36] text-sm sm:text-base">{title}</h2>
        </div>
        {action && (
          <Link href={action.href} className="text-xs text-gray-400 hover:text-[#1a1f36] transition-colors">
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [patents, setPatents] = useState<Patent[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')
  const [show2FABanner, setShow2FABanner] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showPattieIntake, setShowPattieIntake] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/login'); return }
      if (session?.access_token) setAuthToken(session.access_token)

      // ── 2FA soft prompt ──────────────────────────────────────────────────
      try {
        const [{ data: profileRow }, { data: patentProfile }] = await Promise.all([
          supabase.from('profiles').select('require_2fa, two_fa_prompt_dismissed').eq('id', user.id).single(),
          supabase.from('patent_profiles').select('subscription_status, full_name, name_first, name_last, email, entity_status, company').eq('id', user.id).single(),
        ])

        if (profileRow?.require_2fa) {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aalData?.currentLevel !== 'aal2') {
            router.push('/dashboard/security/setup-2fa?required=true&next=/dashboard')
            return
          }
        }

        setProfile({
          full_name: patentProfile?.full_name ?? null,
          name_first: patentProfile?.name_first ?? null,
          name_last: patentProfile?.name_last ?? null,
          email: user.email ?? null,
          entity_status: patentProfile?.entity_status ?? null,
          subscription_status: patentProfile?.subscription_status ?? 'free',
          company: patentProfile?.company ?? null,
        })

        if (!profileRow?.two_fa_prompt_dismissed &&
            (patentProfile?.subscription_status === 'pro' || patentProfile?.subscription_status === 'complimentary')) {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aalData?.currentLevel !== 'aal2') setShow2FABanner(true)
        }
      } catch {
        // non-blocking — still load patents
        setProfile({ full_name: null, name_first: null, name_last: null, email: session.user.email ?? null, entity_status: null, subscription_status: 'free', company: null })
      }

      // ── Data loads ───────────────────────────────────────────────────────
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('patents')
          .select('*')
          .neq('status', 'research_import')
          .order('provisional_deadline', { ascending: true }),
        supabase.from('patent_deadlines')
          .select('*, patents(title)')
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(5),
      ])

      setPatents(p || [])
      setDeadlines((d as Deadline[]) || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function dismiss2FABanner() {
    setShow2FABanner(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ two_fa_prompt_dismissed: true }).eq('id', user.id)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
    )
  }

  const nextDeadlines = deadlines.slice(0, 3)
  const urgentCount = deadlines.filter(d => getDaysUntil(d.due_date) <= 30).length

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* 2FA Soft Prompt */}
      {show2FABanner && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <span className="text-sm text-indigo-800">
              🔐 <strong>Secure your Pro account</strong> — enable two-factor authentication.
            </span>
            <div className="flex items-center gap-3">
              <Link href="/dashboard/security/setup-2fa?next=/dashboard"
                className="text-xs font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded-lg">
                Set up 2FA →
              </Link>
              <button onClick={dismiss2FABanner} className="text-xs text-indigo-400 hover:text-indigo-600">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Urgent deadline banner */}
      {urgentCount > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-red-800 font-medium">
              🚨 {urgentCount} deadline{urgentCount > 1 ? 's' : ''} within 30 days
            </span>
            <Link href="/dashboard/deadlines" className="text-xs text-red-700 font-semibold hover:underline">
              View deadlines →
            </Link>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* ── My Profile ── */}
        <SectionCard title="My Profile" icon="👤" action={{ label: 'Edit', href: '/profile' }}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1a1f36]">
                {profile ? displayName(profile) : '—'}
              </span>
              {profile?.subscription_status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  profile.subscription_status === 'pro' || profile.subscription_status === 'complimentary'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {subLabel(profile.subscription_status)}
                </span>
              )}
            </div>
            {profile?.email && (
              <p className="text-xs text-gray-400">{profile.email}</p>
            )}
            {profile?.company && (
              <p className="text-xs text-gray-500">{profile.company}</p>
            )}
            <div className="pt-1 flex flex-wrap gap-4 text-xs text-gray-500">
              <span>
                <span className="font-medium text-gray-700">Entity Status: </span>
                {entityLabel(profile?.entity_status ?? null)}
              </span>
              <span>
                <span className="font-medium text-gray-700">Patents: </span>
                {patents.length}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* ── My Patents ── */}
        <SectionCard title="My Patents" icon="📋" action={{ label: 'View all', href: '/dashboard/patents' }}>
          {patents.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm mb-4">No patents yet.</p>
              <button
                onClick={() => setShowPattieIntake(true)}
                className="inline-flex items-center gap-1 px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors"
              >
                + Add First Patent
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {patents.slice(0, 6).map(p => {
                const isFiled = p.filing_status === 'provisional_filed' || p.filing_status === 'nonprov_filed'
                const deadlineStr = isFiled && p.nonprov_deadline_at
                  ? p.nonprov_deadline_at.split('T')[0]
                  : p.provisional_deadline
                const days = deadlineStr ? getDaysUntil(deadlineStr) : null

                return (
                  <Link key={p.id} href={`/dashboard/patents/${p.id}`}
                    className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors gap-3 min-h-[44px]">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#1a1f36] truncate">{p.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{statusStage(p)}</div>
                    </div>
                    {days !== null && (
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs ${deadlineBadge(days)}`}>
                        {days <= 0 ? 'OVERDUE' : isFiled ? `NP ${days}d` : `${days}d`}
                      </span>
                    )}
                  </Link>
                )
              })}
              {patents.length > 6 && (
                <p className="text-xs text-gray-400 pt-1">+{patents.length - 6} more</p>
              )}
              <div className="pt-2">
                <button
                  onClick={() => setShowPattieIntake(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add Patent
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── My Deadlines ── */}
        <SectionCard title="My Deadlines" icon="📅" action={{ label: 'View all', href: '/dashboard/deadlines' }}>
          {nextDeadlines.length === 0 ? (
            <p className="text-sm text-gray-400">No pending deadlines.</p>
          ) : (
            <div className="space-y-2">
              {nextDeadlines.map(d => {
                const days = getDaysUntil(d.due_date)
                return (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#1a1f36] truncate">{d.patents?.title}</div>
                      <div className="text-xs text-gray-400">
                        {d.deadline_type.replace(/_/g, ' ')} · Due {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                      {days <= 0 ? 'OVERDUE' : `${days}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* ── My Connections (placeholder) ── */}
        <SectionCard title="My Connections" icon="🔗">
          <p className="text-sm text-gray-400">
            Attorney and partner connections coming soon.{' '}
            <Link href="/find-counsel" className="text-indigo-600 hover:underline text-xs">
              Find counsel →
            </Link>
          </p>
        </SectionCard>

        {/* ── My Settings ── */}
        <SectionCard title="My Settings" icon="⚙️">
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Edit Profile', href: '/profile' },
              { label: 'Security & 2FA', href: '/dashboard/security/setup-2fa' },
              { label: 'Billing', href: '/pricing' },
            ].map(link => (
              <Link key={link.href} href={link.href}
                className="text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:border-gray-400 hover:text-[#1a1f36] transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </SectionCard>

      </div>

      {/* Modals */}
      {showPattieIntake && (
        <PattieIntakeModal
          onClose={() => setShowPattieIntake(false)}
          onManualFallback={() => { setShowPattieIntake(false); setShowNewModal(true) }}
          authToken={authToken}
        />
      )}
      {showNewModal && (
        <NewPatentModal
          onClose={() => setShowNewModal(false)}
          authToken={authToken}
        />
      )}
    </div>
  )
}
