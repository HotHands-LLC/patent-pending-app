'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Partner {
  id: string
  full_name: string
  firm_name: string
  state: string
  specialty?: string
  email: string
  referral_code: string
}

export default function FindCounselPage() {
  const [user, setUser] = useState<any>(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)) }, [])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  useEffect(() => {
    fetch('/api/partners')
      .then(r => r.json())
      .then(d => { setPartners(d.partners ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = partners.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.full_name.toLowerCase().includes(q) ||
      p.firm_name.toLowerCase().includes(q) ||
      (p.specialty?.toLowerCase().includes(q) ?? false)
    const matchState = !stateFilter || p.state === stateFilter
    return matchSearch && matchState
  })

  const states = [...new Set(partners.map(p => p.state))].sort()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-indigo-700">PatentPending</Link>
        <Link href="/partners" className="text-sm text-indigo-600 hover:text-indigo-800">Are you an attorney? →</Link>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Find Patent Counsel</h1>
          <p className="text-gray-600">Connect with patent attorneys who are familiar with the PatentPending workflow.</p>
        </div>

        {/* Search + filter */}
        <div className="flex gap-4 mb-8">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, firm, or specialty..."
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">All States</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && <p className="text-gray-500">Loading attorneys...</p>}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">⚖️</div>
            <p className="text-gray-500 text-lg">No attorneys found matching your search.</p>
            <Link href="/partners" className="text-indigo-600 hover:text-indigo-800 mt-4 inline-block text-sm">
              Are you a patent attorney? Join the program →
            </Link>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-lg">{p.full_name}</h3>
                  <p className="text-indigo-600 font-medium text-sm">{p.firm_name}</p>
                  <p className="text-gray-500 text-sm mt-1">📍 {p.state}</p>
                  {p.specialty && (
                    <p className="text-gray-600 text-sm mt-2">{p.specialty}</p>
                  )}
                </div>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold flex-shrink-0">
                  Verified
                </span>
              </div>

              {user ? (
                <a
                  href={`mailto:${p.email}?subject=Patent%20Consultation%20via%20PatentPending`}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2 border-2 border-indigo-200 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition-colors"
                >
                  ✉️ Contact {p.full_name.split(' ')[0]}
                </a>
              ) : (
                <Link
                  href="/login"
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2 border-2 border-gray-200 text-gray-500 rounded-lg text-sm font-semibold hover:border-indigo-300 transition-colors"
                >
                  Sign in to contact →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
