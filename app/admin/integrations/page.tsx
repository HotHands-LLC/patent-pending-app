'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

interface Integration { service: string; is_active: boolean; connected_at: string | null; realm_id: string | null }

// ──────────────────────────────────────────────
// Per-platform setup guides
// ──────────────────────────────────────────────
const GUIDES: Record<string, { portalUrl: string; steps: string[] }> = {
  qbo: {
    portalUrl: 'https://developer.intuit.com/app/developer/dashboard',
    steps: [
      'Go to developer.intuit.com → Sign in → Create an app (select QuickBooks Online Accounting).',
      'In your app settings, add the redirect URI: https://patentpending.app/api/integrations/qbo/callback',
      'Copy the Client ID and Client Secret from Keys & OAuth → Production keys.',
      'Add QBO_CLIENT_ID and QBO_CLIENT_SECRET to Vercel → Project Settings → Environment Variables.',
      'Redeploy the app, then click "Connect QuickBooks Online" below.',
    ],
  },
  facebook: {
    portalUrl: 'https://developers.facebook.com/apps/',
    steps: [
      'Go to developers.facebook.com → Create App → Business type.',
      'Under App Settings → Basic: set the App Domain to patentpending.app.',
      'Add "Facebook Login" product → Settings → add redirect URI: https://patentpending.app/api/integrations/facebook/callback',
      'Request permissions: pages_manage_posts, pages_read_engagement (in App Review if live).',
      'Copy App ID and App Secret from App Settings → Basic.',
      'Add FB_APP_ID and FB_APP_SECRET to Vercel → Project Settings → Environment Variables.',
      'Redeploy, then click "Connect Facebook" below. Make sure your Facebook account manages at least one Page.',
    ],
  },
  reddit: {
    portalUrl: 'https://www.reddit.com/prefs/apps',
    steps: [
      'Go to reddit.com/prefs/apps → scroll to bottom → "Create App".',
      'Choose type: "web app". Set redirect URI: https://patentpending.app/api/integrations/reddit/callback',
      'Copy the client ID (shown under your app name) and the secret.',
      'Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to Vercel → Environment Variables.',
      'Redeploy, then click "Connect Reddit" below.',
    ],
  },
  linkedin: {
    portalUrl: 'https://www.linkedin.com/developers/apps',
    steps: [
      'Go to linkedin.com/developers/apps → Create app (use your LinkedIn Company Page).',
      'Under Auth tab → add redirect URL: https://patentpending.app/api/integrations/linkedin/callback',
      'Request the "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products.',
      'Copy Client ID and Client Secret from the Auth tab.',
      'Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to Vercel → Environment Variables.',
      'Redeploy, then click "Connect LinkedIn" below.',
    ],
  },
}

const INTEGRATIONS = [
  { id: 'qbo',      name: 'QuickBooks Online', icon: '📊', desc: 'Sync Stripe payments to QBO automatically as income transactions.', available: true },
  { id: 'facebook', name: 'Facebook / Meta',   icon: '📘', desc: 'Post to your Facebook Page — OAuth via Meta Graph API.',           available: true },
  { id: 'reddit',   name: 'Reddit',             icon: '🔴', desc: 'Post to r/patents, r/inventors — OAuth via Reddit API.',           available: true },
  { id: 'linkedin', name: 'LinkedIn',            icon: '💼', desc: 'Post to personal profile — OAuth via LinkedIn API.',              available: true },
  { id: 'shopify',  name: 'Shopify',             icon: '🛒', desc: 'Sync orders and revenue from Shopify stores.',                    available: false },
  { id: 'xero',     name: 'Xero',                icon: '💼', desc: 'Alternative to QBO for UK/AU users.',                            available: false },
]

// ──────────────────────────────────────────────
// Guide accordion component
// ──────────────────────────────────────────────
function SetupGuide({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const guide = GUIDES[id]
  if (!guide) return null
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
// Main page
// ──────────────────────────────────────────────
export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [authToken, setAuthToken] = useState('')
  const [connected, setConnected] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string }>>({})
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000) }

  // Show URL-based feedback (connected= / error=) on mount
  useEffect(() => {
    const connectedService = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connectedService) showToast(`✅ ${connectedService.toUpperCase()} connected successfully!`)
    if (error) {
      const errorMessages: Record<string, string> = {
        no_code: 'Authorization cancelled or no code returned.',
        token_exchange_failed: 'Token exchange failed — check your Client ID/Secret are correct.',
        token_failed: 'Token request failed — credentials may be wrong.',
      }
      showToast(`❌ ${errorMessages[error] ?? `Error: ${error}`}`)
    }
    // Clean URL params without navigating
    if (connectedService || error) {
      window.history.replaceState({}, '', '/admin/integrations')
    }
  }, [searchParams])

  const loadIntegrations = useCallback((token: string) => {
    fetch('/api/integrations', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setConnected(d.integrations ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const t = session?.access_token ?? ''
        setAuthToken(t)
        loadIntegrations(t)
      })
    })
  }, [router, loadIntegrations])

  async function disconnect(service: string) {
    if (!confirm(`Disconnect ${service}?`)) return
    await fetch(`/api/integrations?service=${service}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } })
    setConnected(prev => prev.filter(c => c.service !== service))
    showToast('Disconnected')
  }

  async function testConnection(serviceId: string) {
    setTesting(serviceId)
    try {
      const res = await fetch(`/api/integrations/health?service=${serviceId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      setTestResults(prev => ({ ...prev, [serviceId]: { ok: data.ok, detail: data.detail } }))
    } catch {
      setTestResults(prev => ({ ...prev, [serviceId]: { ok: false, detail: 'Network error — could not reach health endpoint' } }))
    } finally {
      setTesting(null)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
          <span>/</span>
          <span className="text-[#1a1f36]">Integrations</span>
        </div>
        <h1 className="text-2xl font-bold text-[#1a1f36] mb-2">🔗 Integrations</h1>
        <p className="text-sm text-gray-500 mb-6">
          Connect external platforms. Click <strong>How to connect</strong> on any card for setup instructions.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INTEGRATIONS.map(intg => {
            const conn = connected.find(c => c.service === intg.id)
            const isConnected = !!conn?.is_active
            const result = testResults[intg.id]

            return (
              <div
                key={intg.id}
                className={`bg-white rounded-xl border p-5 ${isConnected ? 'border-green-200' : 'border-gray-200'}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{intg.icon}</span>
                    <div>
                      <p className="font-semibold text-[#1a1f36]">{intg.name}</p>
                      <p className={`text-xs ${isConnected ? 'text-green-600' : intg.available ? 'text-amber-500' : 'text-gray-300'}`}>
                        {isConnected ? '✅ Connected' : intg.available ? '⚠️ Not connected' : '🔜 Coming soon'}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mb-3 leading-relaxed">{intg.desc}</p>

                {/* Action buttons */}
                {intg.available ? (
                  isConnected ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 flex-1 truncate">
                          {conn.realm_id ? `Company: ${conn.realm_id}` : 'Connected'}
                          {conn.connected_at && ` · ${new Date(conn.connected_at).toLocaleDateString()}`}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => testConnection(intg.id)}
                          disabled={testing === intg.id}
                          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {testing === intg.id ? '⏳ Testing…' : '🧪 Test Connection'}
                        </button>
                        <button
                          onClick={() => disconnect(intg.id)}
                          className="text-xs text-red-400 hover:text-red-600 px-2"
                        >
                          Disconnect
                        </button>
                      </div>
                      {result && (
                        <p className={`text-xs ${result.ok ? 'text-green-600' : 'text-red-500'}`}>
                          {result.ok ? '✅' : '❌'} {result.detail}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {result && (
                        <p className={`text-xs ${result.ok ? 'text-green-600' : 'text-red-500'}`}>
                          {result.ok ? '✅' : '❌'} {result.detail}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <a
                          href={`/api/integrations/${intg.id}/auth?token=${authToken}`}
                          className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
                        >
                          Connect {intg.name} →
                        </a>
                        <button
                          onClick={() => testConnection(intg.id)}
                          disabled={testing === intg.id}
                          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {testing === intg.id ? '⏳' : 'Check config'}
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <button className="px-4 py-2 border border-gray-200 text-gray-400 rounded-lg text-xs cursor-not-allowed">
                    Coming Soon
                  </button>
                )}

                {/* How to connect guide */}
                {intg.available && <SetupGuide id={intg.id} />}
              </div>
            )
          })}
        </div>

        {/* Env var status summary */}
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-[#1a1f36] text-sm mb-3">⚙️ Environment Variable Checklist</h2>
          <p className="text-xs text-gray-500 mb-4">
            These vars must be set in <strong>Vercel → Project Settings → Environment Variables</strong> (Production).
            Missing vars prevent OAuth from starting.
          </p>
          <div className="space-y-1">
            {[
              { key: 'QBO_CLIENT_ID', service: 'QuickBooks Online' },
              { key: 'QBO_CLIENT_SECRET', service: 'QuickBooks Online' },
              { key: 'FB_APP_ID', service: 'Facebook / Meta' },
              { key: 'FB_APP_SECRET', service: 'Facebook / Meta' },
              { key: 'LINKEDIN_CLIENT_ID', service: 'LinkedIn' },
              { key: 'LINKEDIN_CLIENT_SECRET', service: 'LinkedIn' },
              { key: 'REDDIT_CLIENT_ID', service: 'Reddit' },
              { key: 'REDDIT_CLIENT_SECRET', service: 'Reddit' },
            ].map(({ key, service }) => (
              <div key={key} className="flex items-center gap-3 text-xs">
                <code className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded font-mono text-gray-700">{key}</code>
                <span className="text-gray-400">→ {service}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            After adding env vars: redeploy on Vercel (or push a commit), then use the &quot;Check config&quot; button on each card.
          </p>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
