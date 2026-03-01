'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/patents', label: 'Patents' },
    { href: '/dashboard/deadlines', label: 'Deadlines' },
  ]

  return (
    <nav className="bg-[#1a1f36] text-white">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-bold text-lg">⚖️ PatentPending</Link>
          <div className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === l.href
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
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
        </div>
      </div>
    </nav>
  )
}
