'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

interface Feature {
  feature_key: string; feature_name: string; description: string | null
  category: string | null; applies_to: string[] | null; certified: boolean
}
interface BrandFeature { feature_key: string; status: string; brand: string }

const CATEGORY_COLORS: Record<string, string> = {
  core: 'bg-blue-100 text-blue-700', marketing: 'bg-purple-100 text-purple-700',
  analytics: 'bg-green-100 text-green-700', operations: 'bg-amber-100 text-amber-700',
  integrations: 'bg-gray-100 text-gray-700',
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
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const t = session?.access_token ?? ''
        setAuthToken(t)
        fetch('/api/admin/feature-catalog', { headers: { Authorization: `Bearer ${t}` } })
          .then(r => r.json()).then(d => { setFeatures(d.features ?? []); setBrandFeatures(d.brand_features ?? []) })
          .finally(() => setLoading(false))
      })
    })
  }, [router])

  async function deployToBrand(featureKey: string) {
    setDeploying(featureKey)
    const res = await fetch('/api/admin/feature-catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ feature_key: featureKey, brand: selectedBrand }),
    })
    const d = await res.json()
    if (res.ok) { showToast(`✅ Queued for ${selectedBrand}`); setBrandFeatures(prev => [...prev, { feature_key: featureKey, status: 'queued', brand: selectedBrand }]) }
    else showToast(d.error ?? 'Failed')
    setDeploying(null)
  }

  const ppAppDeployed = brandFeatures.filter(bf => bf.brand === 'pp.app' && bf.status === 'deployed').map(bf => bf.feature_key)
  const brandDeployed = brandFeatures.filter(bf => bf.brand === selectedBrand).map(bf => bf.feature_key)

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link><span>/</span>
          <span className="text-[#1a1f36]">Feature Catalog</span>
        </div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">🏗️ Feature Catalog</h1>
            <p className="text-sm text-gray-500 mt-1">{ppAppDeployed.length} features deployed on pp.app · One-click deploy to other brands</p>
          </div>
          <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="bobozly">bobozly</option>
            <option value="ody">ody.net</option>
            <option value="tea">total tea</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Feature</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">pp.app</th>
                <th className="px-4 py-3 text-left">{selectedBrand}</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {features.map(f => {
                const onPpApp = ppAppDeployed.includes(f.feature_key)
                const onBrand = brandDeployed.includes(f.feature_key)
                const appliesToBrand = !f.applies_to || f.applies_to.includes('all') || f.applies_to.includes(selectedBrand)
                return (
                  <tr key={f.feature_key} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#1a1f36]">{f.feature_name}</div>
                      <div className="text-xs text-gray-400">{f.description?.slice(0, 60)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[f.category ?? 'core'] ?? 'bg-gray-100 text-gray-600'}`}>
                        {f.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {onPpApp ? (f.certified ? '✅ 🏛️' : '✅') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {onBrand ? <span className="text-green-600 font-semibold">✅ Deployed</span> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {!onBrand && appliesToBrand && (
                        <button onClick={() => deployToBrand(f.feature_key)} disabled={deploying === f.feature_key}
                          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                          {deploying === f.feature_key ? '⏳' : '→ Deploy'}
                        </button>
                      )}
                      {!appliesToBrand && <span className="text-xs text-gray-300">n/a</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1f36] text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg z-50">{toast}</div>}
    </div>
  )
}
