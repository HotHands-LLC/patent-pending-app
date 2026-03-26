'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface ActivityEntry {
  id: string
  actor_type: string
  actor_label: string | null
  action_type: string
  summary: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

const ACTOR_ICONS: Record<string, string> = {
  user: '👤', pattie: '🤖', system: '⚙️', attorney: '👔', collaborator: '👥',
}
const ACTOR_COLORS: Record<string, string> = {
  user: 'bg-blue-100 text-blue-700', pattie: 'bg-violet-100 text-violet-700',
  system: 'bg-gray-100 text-gray-600', attorney: 'bg-amber-100 text-amber-700',
  collaborator: 'bg-green-100 text-green-700',
}

function relTime(iso: string) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

type Filter = 'all' | 'user' | 'pattie' | 'system' | 'attorney'

export default function PatentActivityTimeline({ patentId, authToken }: {
  patentId: string; authToken?: string
}) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const PAGE_SIZE = 20

  const fetchEntries = useCallback(async (pg: number, f: Filter) => {
    setLoading(true)
    let query = supabase
      .from('patent_activity_log')
      .select('id, actor_type, actor_label, action_type, summary, old_value, new_value, created_at')
      .eq('patent_id', patentId)
      .order('created_at', { ascending: false })
      .range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)

    if (f !== 'all') query = query.eq('actor_type', f)

    const { data } = await query
    const rows = (data ?? []) as ActivityEntry[]
    if (pg === 0) setEntries(rows)
    else setEntries(prev => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }, [patentId])

  useEffect(() => { setPage(0); fetchEntries(0, filter) }, [filter, fetchEntries])

  const filtered = filter === 'all' ? entries : entries.filter(e => e.actor_type === filter)

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {(['all','user','pattie','system','attorney'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'all' ? 'All' : `${ACTOR_ICONS[f]} ${f}`}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {loading && entries.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center animate-pulse">Loading activity…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-gray-400 py-8 text-center">No activity yet. Actions on this patent will appear here.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => {
            const isExpanded = expandedId === entry.id
            return (
              <div key={entry.id} className="flex items-start gap-3 group">
                {/* Actor badge */}
                <span className={`mt-0.5 shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${ACTOR_COLORS[entry.actor_type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ACTOR_ICONS[entry.actor_type] ?? '?'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 truncate">{entry.actor_label ?? entry.actor_type}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{relTime(entry.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{entry.summary}</p>
                  {(entry.old_value || entry.new_value) && (
                    <button onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="text-[10px] text-indigo-500 hover:underline mt-0.5">
                      {isExpanded ? '▲ hide diff' : '▼ show diff'}
                    </button>
                  )}
                  {isExpanded && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
                      {entry.old_value && (
                        <div className="bg-red-50 border border-red-100 rounded p-2 text-red-700 font-mono overflow-hidden">
                          <div className="font-bold mb-0.5 text-red-500">Before</div>
                          {entry.old_value}
                        </div>
                      )}
                      {entry.new_value && (
                        <div className="bg-green-50 border border-green-100 rounded p-2 text-green-700 font-mono overflow-hidden">
                          <div className="font-bold mb-0.5 text-green-500">After</div>
                          {entry.new_value}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {hasMore && (
            <button onClick={() => { const next = page + 1; setPage(next); fetchEntries(next, filter) }}
              disabled={loading}
              className="w-full text-xs text-indigo-500 hover:underline py-2 disabled:opacity-50">
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
