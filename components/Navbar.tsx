'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function usePendingReviewCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    async function fetchCount() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count: n } = await supabase
        .from('review_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('owner_id', user.id)
      setCount(n ?? 0)
    }
    fetchCount()
    const t = setInterval(fetchCount, 60_000)
    return () => clearInterval(t)
  }, [])
  return count
}

type Tier = 'free' | 'pro' | 'complimentary' | null

function useSubscriptionTier(): Tier {
  const [tier, setTier] = useState<Tier>(null)
  useEffect(() => {
    async function fetchTier() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('patent_profiles')
        .select('subscription_status').eq('id', user.id).single()
      setTier((data?.subscription_status as Tier) ?? 'free')
    }
    fetchTier()
  }, [])
  return tier
}

function TierBadge({ tier }: { tier: Tier }) {
  if (!tier) return null
  if (tier === 'pro') return (
    <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-400 text-[#1a1f36] font-bold leading-none">Pro</span>
  )
  if (tier === 'complimentary') return (
    <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-indigo-400 text-white font-bold leading-none">✦</span>
  )
  return (
    <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-white/20 text-white/70 font-medium leading-none">Free</span>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const pendingCount = usePendingReviewCount()
  const tier = useSubscriptionTier()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setIsLoggedIn(!!user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const loggedInLinks = [
    { href: '/dashboard',                 label: 'Dashboard'      },
    { href: '/dashboard/patents',         label: 'Patents'        },
    { href: '/dashboard/correspondence',  label: 'Correspondence' },
    { href: '/dashboard/deadlines',       label: 'Deadlines'      },
  ]

  const loggedOutLinks = [
    { href: '/pricing', label: 'Pricing' },
  ]

  const links = isLoggedIn ? loggedInLinks : loggedOutLinks

  return (
    <nav className="bg-[#1a1f36] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link href={isLoggedIn ? '/dashboard' : '/'} className="font-bold text-base sm:text-lg whitespace-nowrap">
              ⚖️ PatentPending
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === l.href
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {l.label}
                  {l.href === '/dashboard' && pendingCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                  )}
                </Link>
              ))}

              {/* Account tab — only for logged-in users */}
              {isLoggedIn && (
                <Link
                  href="/profile"
                  className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/profile'
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Account
                  <TierBadge tier={tier} />
                </Link>
              )}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {isLoggedIn ? (
              <>
                <Link
                  href="/dashboard/patents/new"
                  className="px-3 py-1.5 bg-[#f5a623] text-[#1a1f36] rounded-lg text-sm font-semibold hover:bg-[#f5a623]/90 transition-colors"
                >
                  + New Patent
                </Link>
                <button
                  onClick={signOut}
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" className="px-3 py-1.5 bg-[#f5a623] text-[#1a1f36] rounded-lg text-sm font-semibold hover:bg-[#f5a623]/90 transition-colors">
                Sign in
              </Link>
            )}
          </div>

          <button
            className="md:hidden flex items-center justify-center w-11 h-11 text-white/80 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="3" x2="19" y2="19"/>
                <line x1="19" y1="3" x2="3" y2="19"/>
              </svg>
            ) : (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="6" x2="20" y2="6"/>
                <line x1="2" y1="11" x2="20" y2="11"/>
                <line x1="2" y1="16" x2="20" y2="16"/>
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden mt-3 pb-3 border-t border-white/10 pt-3 space-y-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={`relative flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  pathname === l.href
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {l.label}
                {l.href === '/dashboard' && pendingCount > 0 && (
                  <span className="ml-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                )}
              </Link>
            ))}

            {/* Mobile Account tab */}
            {isLoggedIn && (
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  pathname === '/profile'
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Account
                <TierBadge tier={tier} />
              </Link>
            )}

            <div className="pt-2 flex flex-col gap-2">
              {isLoggedIn ? (
                <>
                  <Link
                    href="/dashboard/patents/new"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-center px-3 py-3 bg-[#f5a623] text-[#1a1f36] rounded-lg text-sm font-semibold min-h-[44px]"
                  >
                    + New Patent
                  </Link>
                  <button
                    onClick={signOut}
                    className="flex items-center w-full px-3 py-3 text-white/60 hover:text-white text-sm min-h-[44px]"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center px-3 py-3 bg-[#f5a623] text-[#1a1f36] rounded-lg text-sm font-semibold min-h-[44px]"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
