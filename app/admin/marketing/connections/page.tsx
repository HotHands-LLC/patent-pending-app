'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

interface Connection {
  id: string
  platform: string
  is_active: boolean
  last_tested_at: string | null
  last_post_at: string | null
  post_count: number
}

const PLATFORMS = [
  { id: 'reddit',   name: 'Reddit',    icon: '🔴', fields: ['client_id','client_secret','username','password','subreddit'], hints: ['Reddit app client ID','Reddit app client secret','Your Reddit username','Your Reddit password','Subreddit to post to (e.g. inventors)'] },
  { id: 'linkedin', name: 'LinkedIn',  icon: '💼', fields: ['access_token','person_urn'], hints: ['LinkedIn OAuth access token','Person URN (urn:li:person:xxx) — leave blank for auto-detect'] },
  { id: 'tiktok',   name: 'TikTok',   icon: '🎵', fields: ['access_token'], hints: ['TikTok for Developers access token'] },
  { id: 'instagram',name: 'Instagram', icon: '📸', fields: ['access_token','instagram_user_id'], hints: ['Meta Graph API access token','Instagram business account user ID'] },
  { id: 'google_ads', name: 'Google Ads', icon: '📊', fields: [], hints: [], comingSoon: true },
] as const

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

export default function ConnectionsPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState('')
  const [brand] = useState('pp.app')
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [modalPlatform, setModalPlatform] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const fetchConnections = useCallback(async (token: string) => {
    const res = await fetch(`/api/marketing/connections?brand=${brand}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) { const d = await res.json(); setConnections(d.connections ?? []) }
  }, [brand])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? ''
        setAuthToken(token)
        fetchConnections(token).finally(() => setLoading(false))
      })
    })
  }, [router, fetchConnections])

  function openModal(platformId: string) {
    setModalPlatform(platformId)
    setFormValues({})
    setTestResult(null)
  }

  async function saveCredentials() {
    if (!modalPlatform || !authToken) return
    setSaving(true)
    const credentials: Record<string, string> = {}
    const p = PLATFORMS.find(x => x.id === modalPlatform)
    for (const field of p?.fields ?? []) {
      if (formValues[field]?.trim()) credentials[field] = formValues[field].trim()
    }
    const res = await fetch('/api/marketing/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ brand, platform: modalPlatform, credentials }),
    })
    setSaving(false)
    if (res.ok) { showToast('✅ Credentials saved'); setModalPlatform(null); fetchConnections(authToken) }
    else { const d = await res.json(); showToast(d.error ?? 'Save failed') }
  }

  async function testConnection(platformId: string) {
    setTesting(true); setTestResult(null)
    // Lightweight test — just check if credentials exist for now
    const conn = connections.find(c => c.platform === platformId)
    if (conn?.is_active) { setTestResult('✅ Credentials stored and active'); }
    else { setTestResult('⚠️ No active credentials found') }
    setTesting(false)
  }

  async function disconnect(platformId: string) {
    if (!authToken) return
    await fetch(`/api/marketing/connections?brand=${brand}&platform=${platformId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` }
    })
    fetchConnections(authToken)
    showToast('Disconnected')
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
          <span>/</span>
          <Link href="/admin/marketing" className="hover:text-[#1a1f36]">Marketing</Link>
          <span>/</span>
          <span className="text-[#1a1f36]">Connections</span>
        </div>
        <h1 className="text-2xl font-bold text-[#1a1f36] mb-2">🔌 Platform Connections</h1>
        <p className="text-sm text-gray-500 mb-6">Connect your social platforms to enable one-click posting from Content Cards.</p>

        {/* Platform cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {PLATFORMS.map(p => {
            const conn = connections.find(c => c.platform === p.id && c.is_active)
            const isConnected = !!conn
            return (
              <div key={p.id} className={`bg-white rounded-xl border p-5 ${isConnected ? 'border-green-200' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <p className="font-semibold text-[#1a1f36]">{p.name}</p>
                      <p className={`text-xs ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>
                        {(p as any).comingSoon ? '🔜 Coming Soon' : isConnected ? '✅ Connected' : '⚠️ Not connected'}
                      </p>
                    </div>
                  </div>
                  {!(p as any).comingSoon && (
                    <div className="flex gap-2">
                      {isConnected && (
                        <button onClick={() => testConnection(p.id)} disabled={testing}
                          className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                          {testing ? '⏳' : '🧪 Test'}
                        </button>
                      )}
                      <button onClick={() => openModal(p.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${isConnected ? 'border border-gray-200 text-gray-600 hover:bg-gray-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                        {isConnected ? 'Edit' : 'Connect'}
                      </button>
                      {isConnected && (
                        <button onClick={() => disconnect(p.id)} className="text-xs text-gray-300 hover:text-red-400 px-1.5">✕</button>
                      )}
                    </div>
                  )}
                </div>
                {isConnected && (
                  <div className="text-xs text-gray-400 flex gap-4">
                    {conn.last_post_at && <span>Last post: {relTime(conn.last_post_at)}</span>}
                    <span>{conn.post_count} post{conn.post_count !== 1 ? 's' : ''}</span>
                    {conn.last_tested_at && <span>Tested: {relTime(conn.last_tested_at)}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Budget placeholder */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-[#1a1f36] text-sm mb-4">💳 Budget & Billing (Reference)</h2>
          <p className="text-xs text-gray-400 mb-4">Track your ad spend reference. Direct ad spend goes to each platform directly — this is for your reference only.</p>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monthly Budget ($)</label>
              <input type="number" placeholder="500" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Card last 4</label>
              <input type="text" maxLength={4} placeholder="4242" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Estimated spend this month: $0 / $— (Google Ads integration coming soon)</p>
        </div>
      </div>

      {/* Connect modal */}
      {modalPlatform && (() => {
        const p = PLATFORMS.find(x => x.id === modalPlatform)!
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#1a1f36]">{p.icon} Connect {p.name}</h3>
                <button onClick={() => setModalPlatform(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              <div className="space-y-3 mb-4">
                {p.fields.map((field, i) => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">{field.replace(/_/g,' ')}</label>
                    <input type={field.includes('password') || field.includes('secret') || field.includes('token') ? 'password' : 'text'}
                      value={formValues[field] ?? ''}
                      onChange={e => setFormValues(prev => ({...prev, [field]: e.target.value}))}
                      placeholder={p.hints[i] ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>
              {testResult && <p className="text-xs mb-3 text-indigo-700">{testResult}</p>}
              <div className="flex gap-3">
                <button onClick={saveCredentials} disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Credentials'}
                </button>
                <button onClick={() => setModalPlatform(null)} className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              </div>
              <p className="text-xs text-gray-400 mt-3">🔒 Credentials stored in encrypted admin-only table. Never logged or exposed.</p>
            </div>
          </div>
        )
      })()}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
