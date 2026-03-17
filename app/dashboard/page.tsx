'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase, Patent, PatentDeadline, getDaysUntil, getUrgencyBadge } from '@/lib/supabase'
import PatentPhaseWidget from "@/components/dashboard/PatentPhaseWidget"
import ReviewQueue from "@/components/dashboard/ReviewQueue"
import PatentIntakeCard from "@/components/dashboard/PatentIntakeCard"
import NewPatentModal from "@/components/NewPatentModal"
import PattieCommandBar from "@/components/dashboard/PattieCommandBar"

export default function Dashboard() {
  const [patents, setPatents] = useState<Patent[]>([])
  const [deadlines, setDeadlines] = useState<(PatentDeadline & { patents: { title: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [authToken, setAuthToken] = useState('')
  const [show2FABanner, setShow2FABanner] = useState(false)
  const [require2FA, setRequire2FA] = useState(false)
  const [onboardingShown, setOnboardingShown] = useState(true) // default true until loaded
  const [firstName, setFirstName] = useState('there')
  const [showFilingGate, setShowFilingGate] = useState(false)
  const [pendingFilingHref, setPendingFilingHref] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/login'); return }
      if (session?.access_token) setAuthToken(session.access_token)

      // ── 2FA tier checks ───────────────────────────────────────────────────
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('require_2fa, two_fa_prompt_dismissed, subscription_status')
          .eq('id', user.id)
          .single()

        if (profile) {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          const isaal2 = aalData?.currentLevel === 'aal2'

          if (profile.require_2fa && !isaal2) {
            // Hard redirect — agency account requires 2FA
            router.push('/dashboard/security/setup-2fa?required=true&next=/dashboard')
            return
          }

          // Pro prompt: show dismissible banner on first Pro login
          if (
            !isaal2 &&
            !profile.two_fa_prompt_dismissed &&
            (profile.subscription_status === 'pro' || profile.subscription_status === 'complimentary')
          ) {
            setShow2FABanner(true)
          }
        }
      } catch {
        // 2FA check non-blocking — don't fail dashboard load
      }

      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('patents').select('*').neq('status', 'research_import').order('provisional_deadline', { ascending: true }),
        supabase.from('patent_deadlines')
          .select('*, patents(title)')
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(5)
      ])

      setPatents(p || [])
      setDeadlines((d as (PatentDeadline & { patents: { title: string } })[]) || [])

      // Check onboarding_shown + grab firstName
      const { data: profileData } = await supabase
        .from('patent_profiles')
        .select('onboarding_shown, name_first')
        .eq('id', user.id)
        .single()
      setOnboardingShown((profileData as Record<string,unknown>)?.onboarding_shown === true)
      const fn = (profileData as Record<string,unknown>)?.name_first as string | undefined
      if (fn) setFirstName(fn)
      else {
        // Fall back to profiles.display_name first word
        const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
        if (prof?.display_name) setFirstName(prof.display_name.split(' ')[0])
      }

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  const urgentCount = deadlines.filter(d => getDaysUntil(d.due_date) <= 30).length
  const warningCount = deadlines.filter(d => { const days = getDaysUntil(d.due_date); return days > 30 && days <= 90 }).length

  async function dismiss2FABanner() {
    setShow2FABanner(false)
    await supabase.from('profiles').update({ two_fa_prompt_dismissed: true }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
  }

  // ── Intent screen — shown once to new users with 0 patents ──────────────
  if (patents.length === 0 && !onboardingShown) {
    const markShown = async () => {
      setOnboardingShown(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await fetch('/api/users/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ onboarding_shown: true }),
        })
      }
    }
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-2xl w-full text-center">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#4f46e5] text-white text-xl font-bold mb-6" aria-hidden>PP</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1f36] mb-2">Welcome to PatentPending.</h1>
            <p className="text-gray-500 mb-8">What brings you here?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {[
                {
                  icon: '💡',
                  label: 'I have an idea',
                  sub: "Start a new patent application with Pattie's help",
                  href: '/dashboard/patents/new?mode=interview',
                },
                {
                  icon: '📄',
                  label: 'I have a patent to finish',
                  sub: 'Upload or enter your existing provisional patent',
                  href: '/dashboard/patents/new',
                },
                {
                  icon: '🔒',
                  label: 'I want to license or sell',
                  sub: 'Browse our marketplace or list your existing patent',
                  href: '/marketplace',
                },
              ].map(card => (
                <Link
                  key={card.label}
                  href={card.href}
                  onClick={markShown}
                  className="flex flex-col items-center text-center p-6 border-2 border-gray-200 rounded-2xl hover:border-[#4f46e5] hover:bg-indigo-50/50 transition-all group"
                >
                  <span className="text-4xl mb-3">{card.icon}</span>
                  <span className="font-semibold text-[#1a1f36] text-sm mb-1 group-hover:text-[#4f46e5]">{card.label}</span>
                  <span className="text-xs text-gray-400 leading-relaxed">{card.sub}</span>
                </Link>
              ))}
            </div>
            <button
              onClick={async () => { await markShown(); router.push('/dashboard') }}
              className="text-sm text-gray-400 hover:text-gray-600 hover:underline transition-colors"
            >
              Skip for now — take me to the dashboard →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Pro 2FA prompt banner */}
      {show2FABanner && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-indigo-800">
              <span>🔐</span>
              <span>
                <strong>Secure your Pro account</strong> — we recommend enabling two-factor authentication.
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href="/dashboard/security/setup-2fa?next=/dashboard"
                className="text-xs font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                Set up 2FA →
              </Link>
              <button
                onClick={dismiss2FABanner}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1a1f36]">Dashboard</h1>
            <p className="text-gray-500 mt-1 text-sm">My Patent Portfolio</p>
          </div>
        </div>

        {/* Pattie Command Bar */}
        <PattieCommandBar
          authToken={authToken}
          firstName={firstName}
          snapshot={{
            patentCount: patents.length,
            urgentDeadlineCount: urgentCount,
            listingCount: patents.filter(p => (p as Record<string,unknown>).marketplace_enabled).length,
            recentPatentTitle: patents[0]?.title,
            urgentPatentName: deadlines[0]?.patents?.title,
            urgentDeadlineDays: deadlines[0] ? getDaysUntil(deadlines[0].due_date) : undefined,
          }}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {[
            { label: 'Total Patents', value: patents.length, color: 'text-[#1a1f36]' },
            { label: 'Urgent Deadlines', value: urgentCount, color: urgentCount > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Warning Deadlines', value: warningCount, color: warningCount > 0 ? 'text-yellow-600' : 'text-green-600' },
            { label: 'Granted', value: patents.filter(p => p.status === 'granted').length, color: 'text-green-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
              <div className={`text-2xl sm:text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Urgent Alert Banner */}
        {urgentCount > 0 && (
          <div className="mb-6 sm:mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start sm:items-center gap-3 flex-1">
              <span className="text-red-500 text-xl flex-shrink-0">🚨</span>
              <div>
                <span className="font-semibold text-red-800 text-sm">
                  {urgentCount} deadline{urgentCount > 1 ? 's' : ''} within 30 days — action required
                </span>
                <span className="text-red-600 text-xs block mt-0.5">File non-provisional applications before deadlines to preserve patent rights.</span>
              </div>
            </div>
            <Link href="/dashboard/deadlines" className="sm:ml-auto px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 text-center min-h-[44px] flex items-center justify-center">
              View Deadlines
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#1a1f36] text-sm sm:text-base">Upcoming Deadlines</h2>
              <Link href="/dashboard/deadlines" className="text-sm text-[#1a1f36]/60 hover:text-[#1a1f36]">View all →</Link>
            </div>
            {deadlines.length === 0 ? (
              <p className="text-gray-400 text-sm">No pending deadlines.</p>
            ) : (
              <div className="space-y-3">
                {deadlines.map((d) => {
                  const days = getDaysUntil(d.due_date)
                  return (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#1a1f36] truncate">{d.patents?.title}</div>
                        <div className="text-xs text-gray-400">{d.deadline_type.replace('_', ' ')} · Due {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(days)}`}>
                        {days <= 0 ? 'OVERDUE' : `${days}d`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Patents List */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#1a1f36] text-sm sm:text-base">Patents</h2>
              <Link href="/dashboard/patents" className="text-sm text-[#1a1f36]/60 hover:text-[#1a1f36]">View all →</Link>
            </div>
            {patents.length === 0 ? (
              <div className="text-center py-10">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#4f46e5] text-white text-lg font-bold mb-4" aria-hidden>PP</span>
                <h3 className="text-base font-semibold text-[#1a1f36] mb-2">Ready when you are.</h3>
                <p className="text-gray-400 text-sm mb-5">Start your first patent with Pattie, or add one you've already filed.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link href="/dashboard/patents/new?mode=interview" className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-[#4338ca] transition-colors">
                    Start with Pattie →
                  </Link>
                  <Link href="/dashboard/patents/new" className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                    Add a patent
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {patents.map((p) => {
                  // Non-prov countdown takes priority once filed; fall back to provisional deadline
                  const isFiled = p.filing_status === 'provisional_filed' || p.filing_status === 'nonprov_filed'
                  const deadlineStr = isFiled && p.nonprov_deadline_at
                    ? p.nonprov_deadline_at.split('T')[0]
                    : p.provisional_deadline
                  const days = deadlineStr ? getDaysUntil(deadlineStr) : null

                  // Color coding: green >180d, yellow 90-180d, orange 30-90d, red <30d
                  function nonprovBadgeClass(d: number): string {
                    if (d <= 0)   return 'bg-red-100 text-red-700'
                    if (d <= 30)  return 'bg-red-100 text-red-700'
                    if (d <= 90)  return 'bg-orange-100 text-orange-700'
                    if (d <= 180) return 'bg-yellow-100 text-yellow-700'
                    return 'bg-green-100 text-green-700'
                  }

                  return (
                    <Link key={p.id} href={`/dashboard/patents/${p.id}`}
                      className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors gap-2 min-h-[44px]">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#1a1f36] truncate">{p.title}</div>
                        <div className="text-xs text-gray-400 capitalize">
                          {isFiled && p.provisional_app_number
                            ? `Filed · ${p.provisional_app_number}`
                            : `${p.status.replace('_', ' ')} · ${p.provisional_number || 'No app #'}`
                          }
                        </div>
                      </div>
                      {days !== null && (
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${isFiled ? nonprovBadgeClass(days) : getUrgencyBadge(days)}`}>
                          {days <= 0
                            ? 'OVERDUE'
                            : isFiled
                              ? `NP ${days}d`
                              : `${days}d`
                          }
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '#new-patent', icon: '➕', label: 'Add Patent' },
            { href: '/dashboard/deadlines', icon: '📅', label: 'View Deadlines' },
            { href: '/dashboard/correspondence', icon: '📬', label: 'Correspondence' },
            { href: '/dashboard/patents', icon: '📋', label: 'All Patents' },
          ].map((a) => (
            a.href === '#new-patent' ? (
              <button key={a.label} onClick={() => { setPendingFilingHref(''); setShowFilingGate(true) }}
                className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-[#1a1f36]/30 transition-colors text-center min-h-[80px] justify-center w-full">
                <span className="text-2xl">{a.icon}</span>
                <span className="text-xs font-medium text-[#1a1f36]">{a.label}</span>
              </button>
            ) : (
              <Link key={a.label} href={a.href}
                className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-[#1a1f36]/30 transition-colors text-center min-h-[80px] justify-center">
                <span className="text-2xl">{a.icon}</span>
                <span className="text-xs font-medium text-[#1a1f36]">{a.label}</span>
              </Link>
            )
          ))}
        </div>
      </div>

      {showNewModal && (
        <NewPatentModal
          onClose={() => setShowNewModal(false)}
          authToken={authToken}
        />
      )}

      {/* ── 2FA Filing Gate Modal ───────────────────────────────────────── */}
      {showFilingGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowFilingGate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-3xl mb-3">🔐</div>
            <h2 className="font-bold text-gray-900 text-lg mb-1">Protect your IP before filing</h2>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">
              Before taking a filing action, we recommend enabling two-factor authentication to protect your patent account and IP rights.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/dashboard/security/setup-2fa?next=/dashboard/patents/new"
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold text-center hover:bg-indigo-700 transition-colors"
                onClick={() => setShowFilingGate(false)}
              >
                Enable 2FA →
              </Link>
              <button
                onClick={async () => {
                  setShowFilingGate(false)
                  // Log dismiss
                  const { data: { user } } = await supabase.auth.getUser()
                  if (user) {
                    await supabase.from('patent_profiles')
                      .update({ twofa_prompt_dismissed_at: new Date().toISOString() })
                      .eq('id', user.id)
                  }
                  if (pendingFilingHref) router.push(pendingFilingHref)
                  else setShowNewModal(true)
                }}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Continue without 2FA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
