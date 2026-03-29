'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

interface Metrics {
  reddit_api_calls: number; posts_published: number; comments_posted: number
  inventors_helped: number; questions_answered: number; community_radar_leads: number
  stories_published: number; signups_from_reddit: number; metric_date: string
}

function MetricCard({ label, value, icon, sub }: { label: string; value: number | string; icon: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-black text-[#1a1f36]">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function ContestPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [radarCount, setRadarCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      Promise.all([
        supabase.from('contest_metrics').select('*').order('metric_date', { ascending: false }).limit(1),
        supabase.from('community_radar_leads').select('id', { count: 'exact', head: true }),
      ]).then(([metricsRes, radarRes]) => {
        setMetrics(metricsRes.data?.[0] ?? null)
        setRadarCount(radarRes.count ?? 0)
      }).finally(() => setLoading(false))
    })
  }, [router])

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="flex items-center justify-center h-64 text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/admin" className="hover:text-[#1a1f36]">Admin</Link><span>/</span>
          <span className="text-[#1a1f36]">Reddit 1M Contest</span>
        </div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f36]">🏆 Reddit 1M App Contest</h1>
            <p className="text-sm text-gray-500 mt-1">Track contest metrics — judges care about genuine community value</p>
          </div>
          <a href="https://www.reddit.com/r/reddit/comments/1gl5i34/reddit_announces_1_million_app_migration_contest/"
            target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 bg-[#ff4500] text-white rounded-lg text-sm font-semibold hover:opacity-90">
            Contest Details →
          </a>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <MetricCard label="Radar Leads Found" value={radarCount} icon="📡" sub="Reddit + HN" />
          <MetricCard label="Questions Answered" value={metrics?.questions_answered ?? 0} icon="💬" />
          <MetricCard label="Inventors Helped" value={metrics?.inventors_helped ?? 0} icon="💡" />
          <MetricCard label="Signups from Reddit" value={metrics?.signups_from_reddit ?? 0} icon="🚀" />
        </div>

        {/* What's been built */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-bold text-[#1a1f36] mb-4">🛠️ Reddit Integration Stack</h2>
          <div className="space-y-2">
            {[
              ['✅', 'Community Radar', 'Monitors Reddit + HN every 4h for patent questions'],
              ['✅', 'Pattie-Reddit Cron', 'Drafts helpful AI replies every 2h — approval queue in Marketing tab'],
              ['✅', 'Reddit OAuth', 'Full posting capability via /admin/integrations'],
              ['✅', 'Inventor Stories', 'Public /stories gallery for community proof'],
              ['✅', 'SEO Blog', '2x/week patent guides — ranks in search, shared on Reddit'],
              ['✅', 'Score Cards', 'Shareable /p/[slug] pages — perfect for Reddit AMAs'],
              ['⏳', 'Contest Submission', 'Final entry at reddit.com/r/redditmigration'],
            ].map(([icon, name, desc]) => (
              <div key={name as string} className="flex items-start gap-3">
                <span className="text-lg shrink-0">{icon}</span>
                <div>
                  <span className="font-semibold text-sm text-[#1a1f36]">{name}</span>
                  <span className="text-xs text-gray-500 ml-2">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contest submission checklist */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="font-bold text-amber-900 mb-3">📋 Submission Checklist</h2>
          <div className="space-y-1.5 text-xs text-amber-800">
            {['Reddit app registered (needs submission)', 'Demo video recorded', 'App description written', 'Submit at contest page'].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span>{i < 0 ? '✅' : '⏳'}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
