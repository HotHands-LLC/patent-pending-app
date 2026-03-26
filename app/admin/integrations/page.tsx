'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

interface Integration { service: string; is_active: boolean; connected_at: string | null; realm_id: string | null }

const INTEGRATIONS = [
  { id: 'qbo', name: 'QuickBooks Online', icon: '📊', desc: 'Sync Stripe payments to QBO automatically as income transactions', available: true },
  { id: 'reddit', name: 'Reddit', icon: '🔴', desc: 'Post to r/patents, r/inventors — OAuth via Reddit API', available: true },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', desc: 'Post to personal profile — OAuth via LinkedIn API', available: true },
  { id: 'shopify', name: 'Shopify', icon: '🛒', desc: 'Sync orders and revenue from Shopify stores', available: false },
  { id: 'xero', name: 'Xero', icon: '💼', desc: 'Alternative to QBO for UK/AU users', available: false },
]

export default function IntegrationsPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState('')
  const [connected, setConnected] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const t = session?.access_token ?? ''
        setAuthToken(t)
        fetch('/api/integrations', { headers: { Authorization: `Bearer ${t}` } })
          .then(r => r.json()).then(d => setConnected(d.integrations ?? [])).finally(() => setLoading(false))
      })
    })
  }, [router])

  async function disconnect(service: string) {
    if (!confirm(`Disconnect ${service}?`)) return
    await fetch(`/api/integrations?service=${service}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } })
    setConnected(prev => prev.filter(c => c.service !== service))
    showToast('Disconnected')
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link><span>/</span>
          <span className="text-[#1a1f36]">Integrations</span>
        </div>
        <h1 className="text-2xl font-bold text-[#1a1f36] mb-6">🔗 Integrations</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INTEGRATIONS.map(intg => {
            const conn = connected.find(c => c.service === intg.id)
            return (
              <div key={intg.id} className={`bg-white rounded-xl border p-5 ${conn?.is_active ? 'border-green-200' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{intg.icon}</span>
                    <div>
                      <p className="font-semibold text-[#1a1f36]">{intg.name}</p>
                      <p className={`text-xs ${conn?.is_active ? 'text-green-600' : intg.available ? 'text-gray-400' : 'text-gray-300'}`}>
                        {conn?.is_active ? '✅ Connected' : intg.available ? '○ Not connected' : '🔜 Coming soon'}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">{intg.desc}</p>
                {intg.available ? (
                  conn?.is_active ? (
                    <div className="flex gap-2">
                      <span className="text-xs text-gray-400">Company: {conn.realm_id ?? 'connected'}</span>
                      <button onClick={() => disconnect(intg.id)} className="ml-auto text-xs text-red-400 hover:text-red-600">Disconnect</button>
                    </div>
                  ) : (
                    <a href={`/api/integrations/${intg.id}/auth?token=${authToken}`}
                      className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">
                      Connect {intg.name} →
                    </a>
                  )
                ) : (
                  <button className="px-4 py-2 border border-gray-200 text-gray-400 rounded-lg text-xs cursor-not-allowed">Coming Soon</button>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg z-50">{toast}</div>}
    </div>
  )
}
