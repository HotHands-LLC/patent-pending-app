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

// ──────────────────────────────────────────────
// Platform definitions
// ──────────────────────────────────────────────
interface PlatformDef {
  id: string
  name: string
  icon: string
  fields: readonly string[]
  hints: readonly string[]
  comingSoon?: boolean
  guide: { portalUrl: string; steps: string[] } | null
}

const PLATFORMS: PlatformDef[] = [
  {
    id: 'reddit',
    name: 'Reddit',
    icon: '🔴',
    fields: ['client_id', 'client_secret', 'username', 'password', 'subreddit'],
    hints: [
      'Reddit app client ID (from reddit.com/prefs/apps)',
      'Reddit app client secret',
      'Your Reddit username (without u/)',
      'Your Reddit password',
      'Subreddit to post to (e.g. inventors)',
    ],
    guide: {
      portalUrl: 'https://www.reddit.com/prefs/apps',
      steps: [
        'Go to reddit.com/prefs/apps → scroll to the bottom → click "Create App".',
        'Name: PatentPending, Type: script (for server-side posting).',
        'Set redirect URI: https://patentpending.app/api/integrations/reddit/callback',
        'After creating, the client ID is the string under your app name; copy the secret too.',
        'Enter your Reddit username and password, plus the subreddit you want to post to.',
      ],
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    fields: ['access_token', 'person_urn'],
    hints: [
      'LinkedIn OAuth access token (from the /integrations OAuth flow)',
      'Person URN (urn:li:person:xxx) — leave blank to auto-detect',
    ],
    guide: {
      portalUrl: 'https://www.linkedin.com/developers/apps',
      steps: [
        'Go to linkedin.com/developers/apps → Create app (associate with your Company Page).',
        'Under Auth tab → add redirect URL: https://patentpending.app/api/integrations/linkedin/callback',
        'Request products: "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect".',
        'Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Vercel env vars.',
        'Connect via Admin → Integrations page (OAuth flow) — the token auto-populates here.',
        'Or paste a long-lived access token from the LinkedIn token generator.',
      ],
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    fields: ['access_token'],
    hints: ['TikTok for Developers access token (from developers.tiktok.com)'],
    guide: {
      portalUrl: 'https://developers.tiktok.com/',
      steps: [
        'Go to developers.tiktok.com → Create a new app.',
        'Add the "Content Posting API" product.',
        'Set redirect URI: https://patentpending.app/api/integrations/tiktok/callback (future).',
        'Use the sandbox token generator during development to get a test access token.',
        'Paste the access token in the field below.',
      ],
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    fields: ['access_token', 'instagram_user_id'],
    hints: [
      'Meta Graph API long-lived access token',
      'Instagram business account user ID',
    ],
    guide: {
      portalUrl: 'https://developers.facebook.com/apps/',
      steps: [
        'Go to developers.facebook.com → Create App → Business type.',
        'Add "Instagram Graph API" product to your app.',
        'Your Instagram account must be a Business or Creator account linked to a Facebook Page.',
        'Use the Graph API Explorer to get a User token with instagram_basic, instagram_content_publish scopes.',
        'Exchange for a long-lived token (60-day expiry); note the Instagram User ID from /me?fields=id.',
        'Paste both values below.',
      ],
    },
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    icon: '📊',
    fields: [],
    hints: [],
    comingSoon: true,
    guide: null,
  },
]

type PlatformId = string

// ──────────────────────────────────────────────
// Guide accordion
// ──────────────────────────────────────────────
function SetupGuide({ platform }: { platform: PlatformDef }) {
  const [open, setOpen] = useState(false)
  if (platform.comingSoon || !platform.guide) return null
  const { guide } = platform
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
      >
        <span>{open ? '▾' : '▸'}</span> How to connect
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <ol className="list-decimal list-inside space-y-1">
            {guide.steps.map((step, i) => (
              <li key={i} className="text-xs text-gray-600 leading-relaxed">{step}</li>
            ))}
          </ol>
          <a
            href={guide.portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline mt-1"
          >
            🔗 Open developer portal ↗
          </a>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function ConnectionsPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState('')
  const [brand] = useState('pp.app')
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [modalPlatform, setModalPlatform] = useState<PlatformId | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string }>>({})
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const fetchConnections = useCallback(async (token: string) => {
    const res = await fetch(`/api/marketing/connections?brand=${brand}`, {
      headers: { Authorization: `Bearer ${token}` },
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

  function openModal(platformId: PlatformId) {
    setModalPlatform(platformId)
    setFormValues({})
  }

  async function saveCredentials() {
    if (!modalPlatform || !authToken) return
    setSaving(true)
    const p = PLATFORMS.find(x => x.id === modalPlatform)
    const credentials: Record<string, string> = {}
    for (const field of p?.fields ?? []) {
      const val = formValues[field]?.trim()
      if (val) credentials[field] = val
    }
    const res = await fetch('/api/marketing/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ brand, platform: modalPlatform, credentials }),
    })
    setSaving(false)
    if (res.ok) {
      showToast('✅ Credentials saved')
      setModalPlatform(null)
      fetchConnections(authToken)
    } else {
      const d = await res.json()
      showToast(d.error ?? 'Save failed')
    }
  }

  async function testConnection(platformId: string) {
    if (!authToken) return
    setTesting(platformId)
    // For OAuth-backed platforms, delegate to the integration health endpoint
    const oauthPlatforms = ['reddit', 'linkedin']
    if (oauthPlatforms.includes(platformId)) {
      try {
        const res = await fetch(`/api/integrations/health?service=${platformId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        const data = await res.json()
        setTestResults(prev => ({ ...prev, [platformId]: { ok: data.ok, detail: data.detail } }))
      } catch {
        setTestResults(prev => ({ ...prev, [platformId]: { ok: false, detail: 'Network error' } }))
      }
    } else {
      // For token-only platforms, just confirm creds are stored and active
      const conn = connections.find(c => c.platform === platformId)
      if (conn?.is_active) {
        setTestResults(prev => ({ ...prev, [platformId]: { ok: true, detail: 'Credentials stored and active' } }))
      } else {
        setTestResults(prev => ({ ...prev, [platformId]: { ok: false, detail: 'No active credentials — use Connect to add them' } }))
      }
    }
    setTesting(null)
  }

  async function disconnect(platformId: string) {
    if (!authToken) return
    await fetch(`/api/marketing/connections?brand=${brand}&platform=${platformId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` },
    })
    fetchConnections(authToken)
    showToast('Disconnected')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    </div>
  )

  const modalPlatformObj = PLATFORMS.find(x => x.id === modalPlatform)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
          <span>/</span>
          <Link href="/admin/marketing" className="hover:text-[#1a1f36]">Marketing</Link>
          <span>/</span>
          <span className="text-[#1a1f36]">Connections</span>
        </div>
        <h1 className="text-2xl font-bold text-[#1a1f36] mb-2">🔌 Platform Connections</h1>
        <p className="text-sm text-gray-500 mb-6">
          Connect social platforms to enable one-click posting. Click <strong>How to connect</strong> on any card for setup instructions.
        </p>

        {/* Platform cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {PLATFORMS.map(p => {
            const conn = connections.find(c => c.platform === p.id && c.is_active)
            const isConnected = !!conn
            const result = testResults[p.id]

            return (
              <div key={p.id} className={`bg-white rounded-xl border p-5 ${isConnected ? 'border-green-200' : 'border-gray-200'}`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <p className="font-semibold text-[#1a1f36]">{p.name}</p>
                      <p className={`text-xs ${isConnected ? 'text-green-600' : p.comingSoon ? 'text-gray-300' : 'text-amber-500'}`}>
                        {p.comingSoon ? '🔜 Coming Soon' : isConnected ? '✅ Connected' : '⚠️ Not connected'}
                      </p>
                    </div>
                  </div>
                  {!p.comingSoon && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => testConnection(p.id)}
                        disabled={testing === p.id}
                        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {testing === p.id ? '⏳' : '🧪 Test'}
                      </button>
                      <button
                        onClick={() => openModal(p.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${
                          isConnected
                            ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {isConnected ? 'Edit' : 'Connect'}
                      </button>
                      {isConnected && (
                        <button onClick={() => disconnect(p.id)} className="text-xs text-gray-300 hover:text-red-400 px-1.5">✕</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Test result */}
                {result && (
                  <p className={`text-xs mb-2 ${result.ok ? 'text-green-600' : 'text-red-500'}`}>
                    {result.ok ? '✅' : '❌'} {result.detail}
                  </p>
                )}

                {/* Post stats */}
                {isConnected && (
                  <div className="text-xs text-gray-400 flex gap-4">
                    {conn.last_post_at && <span>Last post: {relTime(conn.last_post_at)}</span>}
                    <span>{conn.post_count} post{conn.post_count !== 1 ? 's' : ''}</span>
                    {conn.last_tested_at && <span>Tested: {relTime(conn.last_tested_at)}</span>}
                  </div>
                )}

                {/* Setup guide */}
                <SetupGuide platform={p} />
              </div>
            )
          })}
        </div>

        {/* Budget reference section */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-[#1a1f36] text-sm mb-4">💳 Budget & Billing (Reference)</h2>
          <p className="text-xs text-gray-400 mb-4">
            Track your ad spend reference. Direct ad spend goes to each platform — this is for your reference only.
          </p>
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
          <p className="text-xs text-gray-400 mt-3">
            Estimated spend this month: $0 / $— (Google Ads integration coming soon)
          </p>
        </div>
      </div>

      {/* Connect / Edit modal */}
      {modalPlatform && modalPlatformObj && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#1a1f36]">{modalPlatformObj.icon} Connect {modalPlatformObj.name}</h3>
              <button onClick={() => setModalPlatform(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {/* How to connect in modal too */}
            {modalPlatformObj.guide && (
              <details className="mb-4 bg-indigo-50 rounded-lg p-3">
                <summary className="text-xs font-semibold text-indigo-700 cursor-pointer">📖 How to get credentials</summary>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  {modalPlatformObj.guide.steps.map((step, i) => (
                    <li key={i} className="text-xs text-indigo-800 leading-relaxed">{step}</li>
                  ))}
                </ol>
                <a href={modalPlatformObj.guide.portalUrl} target="_blank" rel="noreferrer"
                  className="inline-block mt-2 text-xs text-indigo-600 hover:underline">
                  🔗 Open developer portal ↗
                </a>
              </details>
            )}

            <div className="space-y-3 mb-4">
              {modalPlatformObj.fields.map((field, i) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">
                    {field.replace(/_/g, ' ')}
                  </label>
                  <input
                    type={field.includes('password') || field.includes('secret') || field.includes('token') ? 'password' : 'text'}
                    value={formValues[field] ?? ''}
                    onChange={e => setFormValues(prev => ({ ...prev, [field]: e.target.value }))}
                    placeholder={modalPlatformObj.hints[i] ?? ''}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={saveCredentials}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Credentials'}
              </button>
              <button
                onClick={() => setModalPlatform(null)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              🔒 Credentials stored in encrypted admin-only table. Never logged or exposed.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
