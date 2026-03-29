'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

interface Feature {
  feature_key: string
  feature_name: string
  description: string | null
  category: string | null
  applies_to: string[] | null
  certified: boolean
  tier_required: string | null
  commit_ref: string | null
  deployed_at: string | null
  status: string | null
}
interface BrandFeature { feature_key: string; status: string; brand: string }

const CATEGORY_COLORS: Record<string, string> = {
  core: 'bg-blue-100 text-blue-700',
  marketing: 'bg-purple-100 text-purple-700',
  analytics: 'bg-green-100 text-green-700',
  operations: 'bg-amber-100 text-amber-700',
  integrations: 'bg-gray-100 text-gray-700',
}
const TIER_COLORS: Record<string, string> = {
  free: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-indigo-100 text-indigo-700',
  admin: 'bg-red-100 text-red-700',
}

const EMPTY_FORM = {
  feature_key: '', feature_name: '', description: '', category: 'core',
  tier_required: 'free', commit_ref: '', status: 'available',
}

export default function FeatureCatalogPage() {
  const router = useRouter()
  const [authToken, setAuthToken] = useState('')
  const [features, setFeatures] = useState<Feature[]>([])
  const [brandFeatures, setBrandFeatures] = useState<BrandFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBrand, setSelectedBrand] = useState('bobozly')
  const [deploying, setDeploying] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Filters
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterTier, setFilterTier] = useState('all')

  // Add Feature modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const t = session?.access_token ?? ''
        setAuthToken(t)
        loadData(t)
      })
    })
  }, [router])

  function loadData(t: string) {
    setLoading(true)
    fetch('/api/admin/feature-catalog', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { setFeatures(d.features ?? []); setBrandFeatures(d.brand_features ?? []) })
      .finally(() => setLoading(false))
  }

  async function deployToBrand(featureKey: string) {
    setDeploying(featureKey)
    const res = await fetch('/api/admin/feature-catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ feature_key: featureKey, brand: selectedBrand }),
    })
    const d = await res.json()
    if (res.ok) {
      showToast(`✅ Queued for ${selectedBrand}`)
      setBrandFeatures(prev => [...prev, { feature_key: featureKey, status: 'queued', brand: selectedBrand }])
    } else {
      showToast(d.error ?? 'Failed')
    }
    setDeploying(null)
  }

  async function addFeature(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.feature_key || !addForm.feature_name) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/feature-catalog/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(addForm),
      })
      const d = await res.json()
      if (res.ok) {
        showToast(`✅ Added: ${addForm.feature_name}`)
        setShowAddModal(false)
        setAddForm(EMPTY_FORM)
        loadData(authToken)
      } else {
        showToast(d.error ?? 'Failed to add feature')
      }
    } catch {
      showToast('Network error')
    }
    setSaving(false)
  }

  const ppAppDeployed = brandFeatures.filter(bf => bf.brand === 'pp.app' && bf.status === 'deployed').map(bf => bf.feature_key)
  const brandDeployed = brandFeatures.filter(bf => bf.brand === selectedBrand).map(bf => bf.feature_key)

  // Apply filters
  const filtered = features.filter(f => {
    if (filterCategory !== 'all' && f.category !== filterCategory) return false
    if (filterTier !== 'all' && (f.tier_required ?? 'free') !== filterTier) return false
    return true
  })

  const categories = ['all', ...Array.from(new Set(features.map(f => f.category ?? 'core'))).sort()]
  const tiers = ['all', 'free', 'paid', 'admin']

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link>
          <span>/</span>
          <span className="text-[#1a1f36]">Feature Catalog</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">🏗️ Feature Catalog</h1>
            <p className="text-sm text-gray-500 mt-1">
              {features.length} features · {ppAppDeployed.length} deployed on pp.app
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedBrand}
              onChange={e => setSelectedBrand(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="bobozly">bobozly</option>
              <option value="ody">ody.net</option>
              <option value="tea">total tea</option>
            </select>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors"
            >
              + Add Feature
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Filter:</span>
          <div className="flex gap-1">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterCategory === c
                    ? 'bg-[#1a1f36] text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex gap-1">
            {tiers.map(t => (
              <button
                key={t}
                onClick={() => setFilterTier(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterTier === t
                    ? 'bg-[#1a1f36] text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {(filterCategory !== 'all' || filterTier !== 'all') && (
            <button
              onClick={() => { setFilterCategory('all'); setFilterTier('all') }}
              className="text-xs text-gray-400 hover:text-gray-700 ml-1"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{filtered.length} shown</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Feature</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Tier</th>
                <th className="px-4 py-3 text-left">Deployed</th>
                <th className="px-4 py-3 text-left">pp.app</th>
                <th className="px-4 py-3 text-left">{selectedBrand}</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(f => {
                const onPpApp = ppAppDeployed.includes(f.feature_key)
                const onBrand = brandDeployed.includes(f.feature_key)
                const appliesToBrand = !f.applies_to || f.applies_to.includes('all') || f.applies_to.includes(selectedBrand)
                const tier = f.tier_required ?? 'free'
                return (
                  <tr key={f.feature_key} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#1a1f36]">{f.feature_name}</div>
                      <div className="text-xs text-gray-400">{f.description?.slice(0, 70)}</div>
                      {f.commit_ref && (
                        <div className="text-xs text-gray-300 font-mono mt-0.5">{f.commit_ref}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[f.category ?? 'core'] ?? 'bg-gray-100 text-gray-600'}`}>
                        {f.category ?? 'core'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[tier] ?? 'bg-gray-100 text-gray-600'}`}>
                        {tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(f.deployed_at)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {onPpApp ? (f.certified ? '✅ 🏛️' : '✅') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {onBrand ? <span className="text-green-600 font-semibold">✅</span> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {!onBrand && appliesToBrand && (
                        <button
                          onClick={() => deployToBrand(f.feature_key)}
                          disabled={deploying === f.feature_key}
                          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {deploying === f.feature_key ? '⏳' : '→ Deploy'}
                        </button>
                      )}
                      {!appliesToBrand && <span className="text-xs text-gray-300">n/a</span>}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No features match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Auto-sync hint */}
        <p className="text-xs text-gray-400 mt-3">
          💡 Run <code className="bg-gray-100 px-1 rounded">npx tsx scripts/sync-feature-catalog.ts</code> after shipping to auto-detect new features from commits.
        </p>
      </div>

      {/* Add Feature Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#1a1f36]">Add Feature Manually</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <form onSubmit={addFeature} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Feature Key <span className="text-red-500">*</span></label>
                  <input
                    value={addForm.feature_key}
                    onChange={e => setAddForm(p => ({ ...p, feature_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                    placeholder="e.g. ai_search"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Feature Name <span className="text-red-500">*</span></label>
                  <input
                    value={addForm.feature_name}
                    onChange={e => setAddForm(p => ({ ...p, feature_name: e.target.value }))}
                    placeholder="e.g. AI-Powered Patent Search"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <textarea
                    value={addForm.description}
                    onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Brief description of what this feature does"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={addForm.category}
                    onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="core">core</option>
                    <option value="marketing">marketing</option>
                    <option value="analytics">analytics</option>
                    <option value="operations">operations</option>
                    <option value="integrations">integrations</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tier Required</label>
                  <select
                    value={addForm.tier_required}
                    onChange={e => setAddForm(p => ({ ...p, tier_required: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="free">free</option>
                    <option value="paid">paid</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Commit Ref (optional)</label>
                  <input
                    value={addForm.commit_ref}
                    onChange={e => setAddForm(p => ({ ...p, commit_ref: e.target.value }))}
                    placeholder="e.g. a97e597"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={addForm.status}
                    onChange={e => setAddForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="available">available</option>
                    <option value="beta">beta</option>
                    <option value="deprecated">deprecated</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#1a1f36] text-white text-sm font-medium rounded-lg hover:bg-[#2d3561] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Add Feature'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
