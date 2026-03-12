'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface MarketplaceLead {
  id: string
  patent_id: string
  full_name: string
  email: string
  company: string | null
  phone: string | null
  interest_type: string
  why_statement: string
  status: 'pending' | 'approved' | 'rejected' | 'introduced'
  owner_notified_at: string | null
  introduced_at: string | null
  created_at: string
  // Joined
  patent_title: string
  patent_slug: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const INTEREST_BADGES: Record<string, string> = {
  license:  'bg-blue-100 text-blue-800',
  acquire:  'bg-purple-100 text-purple-800',
  invest:   'bg-green-100 text-green-800',
  partner:  'bg-yellow-100 text-yellow-800',
  other:    'bg-gray-100 text-gray-600',
}

const STATUS_BADGES: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  approved:   'bg-green-100 text-green-800',
  rejected:   'bg-red-100 text-red-800',
  introduced: 'bg-blue-100 text-blue-800',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminMarketplacePage() {
  const router = useRouter()
  const [leads, setLeads]         = useState<MarketplaceLead[]>([])
  const [loading, setLoading]     = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [toast, setToast]         = useState<string | null>(null)

  // ── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const token = session.access_token
      setAuthToken(token)

      // Check is_admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single()

      if (!profile?.is_admin) { router.replace('/dashboard'); return }
      fetchLeads(token)
    })
  }, [router])

  // ── Fetch leads ───────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async (token: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/marketplace/leads', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch (e) {
      console.error('[admin/marketplace] fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleAction(leadId: string, action: 'approve' | 'reject') {
    if (!authToken) return
    setActioningId(leadId)
    try {
      const res = await fetch(`/api/admin/marketplace/leads/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(await res.text())
      setToast(action === 'approve' ? '✅ Approved — intro emails sending…' : '❌ Lead rejected')
      setTimeout(() => setToast(null), 4000)
      // Refresh
      fetchLeads(authToken)
    } catch (e) {
      console.error('[admin/marketplace] action error:', e)
      setToast('Error — check console')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setActioningId(null)
    }
  }

  // ── Counts ────────────────────────────────────────────────────────────────
  const pending   = leads.filter(l => l.status === 'pending').length
  const approved  = leads.filter(l => l.status === 'approved').length
  const introduced = leads.filter(l => l.status === 'introduced').length
  const rejected  = leads.filter(l => l.status === 'rejected').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a1f36] text-white px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-xs text-gray-300 hover:text-white">← Admin</Link>
          <span className="text-sm text-gray-500">|</span>
          <span className="font-bold">🎯 Marketplace Leads</span>
        </div>
        <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded font-bold">ADMIN</span>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Pending', count: pending, color: 'yellow' },
            { label: 'Approved', count: approved, color: 'green' },
            { label: 'Introduced', count: introduced, color: 'blue' },
            { label: 'Rejected', count: rejected, color: 'red' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`text-2xl font-extrabold ${s.color === 'yellow' ? 'text-yellow-600' : s.color === 'green' ? 'text-green-600' : s.color === 'blue' ? 'text-blue-600' : 'text-red-600'}`}>
                {s.count}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-lg font-medium">No marketplace leads yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Patent</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Interest</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Why (hover)</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map(lead => {
                  const canAct = lead.status === 'pending' || lead.status === 'approved'
                  const isActioning = actioningId === lead.id
                  const whySnippet = lead.why_statement.length > 100
                    ? lead.why_statement.slice(0, 97) + '…'
                    : lead.why_statement
                  const isExpanded = expandedId === lead.id

                  return (
                    <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                      {/* Patent */}
                      <td className="px-4 py-3">
                        {lead.patent_slug ? (
                          <Link
                            href={`/marketplace/${lead.patent_slug}`}
                            target="_blank"
                            className="text-indigo-600 hover:underline font-medium max-w-[160px] block truncate"
                            title={lead.patent_title}
                          >
                            {lead.patent_title}
                          </Link>
                        ) : (
                          <span className="text-gray-700 font-medium max-w-[160px] block truncate" title={lead.patent_title}>
                            {lead.patent_title}
                          </span>
                        )}
                      </td>

                      {/* Lead */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{lead.full_name}</div>
                        {lead.company && <div className="text-xs text-gray-400">{lead.company}</div>}
                        <a href={`mailto:${lead.email}`} className="text-xs text-indigo-500 hover:underline">{lead.email}</a>
                      </td>

                      {/* Interest */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${INTEREST_BADGES[lead.interest_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {lead.interest_type}
                        </span>
                      </td>

                      {/* Why */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                          className="text-left text-gray-600 hover:text-gray-900 text-xs leading-relaxed"
                          title={lead.why_statement}
                        >
                          {isExpanded ? lead.why_statement : whySnippet}
                        </button>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(lead.created_at)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${STATUS_BADGES[lead.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {lead.status}
                        </span>
                        {lead.introduced_at && (
                          <div className="text-xs text-gray-400 mt-0.5">{fmtDate(lead.introduced_at)}</div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        {canAct && lead.status !== 'introduced' && (
                          <div className="flex gap-2">
                            {lead.status === 'pending' && (
                              <button
                                onClick={() => handleAction(lead.id, 'approve')}
                                disabled={isActioning}
                                className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                {isActioning ? '…' : 'Approve'}
                              </button>
                            )}
                            {(lead.status === 'pending' || lead.status === 'approved') && (
                              <button
                                onClick={() => handleAction(lead.id, 'reject')}
                                disabled={isActioning}
                                className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors border border-red-200"
                              >
                                {isActioning ? '…' : 'Reject'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
