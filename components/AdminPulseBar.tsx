'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface PulseData {
  queue: { status: string; active_label: string | null; elapsed_seconds: number; estimated_minutes: number; items_waiting: number }
  next_cron: { label: string; minutes_until: number; currently_running: boolean; running_name: string | null }
  errors: { p0_count: number; p1_count: number; p2_count: number }
  patents: { active_count: number; provisional_ready: number; filed: number }
}

function fmt(mins: number) {
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins/60)}h ${mins%60}m`
}
function fmtSec(s: number) {
  return `${Math.floor(s/60)}m ${s%60}s`
}

export default function AdminPulseBar() {
  const router = useRouter()
  const [data, setData] = useState<PulseData | null>(null)
  const [token, setToken] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token)
    })
  }, [])

  const fetchPulse = useCallback(async (t: string) => {
    if (!t) return
    try {
      const res = await fetch('/api/admin/pulse', { headers: { Authorization: `Bearer ${t}` } })
      if (res.ok) setData(await res.json())
    } catch { /* non-blocking */ }
  }, [])

  useEffect(() => {
    if (!token) return
    fetchPulse(token)
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') fetchPulse(token)
    }, 10000)
    return () => clearInterval(iv)
  }, [token, fetchPulse])

  if (!data) return null

  const { queue, next_cron, errors, patents } = data
  const hasP0 = errors.p0_count > 0

  const queueIcon = queue.status === 'running' ? '🟢' : queue.status === 'paused' ? '⏸️' : queue.status === 'idle' ? '💤' : '✅'
  const queueLabel = queue.status === 'running'
    ? `${queue.active_label?.slice(0, 28) ?? 'Running'} · ~${Math.max(1, queue.estimated_minutes)}m left`
    : queue.status === 'paused' ? 'Queue paused'
    : queue.status === 'idle' ? `Idle — ${queue.items_waiting} waiting`
    : 'Queue clear'

  const cronLabel = next_cron.currently_running
    ? `⚡ ${next_cron.running_name?.replace('claw-','')?.replace('-nightly','') ?? 'Cron'} running`
    : `⏰ ${next_cron.label} · ${fmt(next_cron.minutes_until)}`

  const errLabel = hasP0 ? `🔴 ${errors.p0_count} P0 error${errors.p0_count > 1 ? 's' : ''}`
    : errors.p1_count > 0 ? `⚠️ ${errors.p1_count} warning${errors.p1_count > 1 ? 's' : ''}`
    : '✅ No errors'

  return (
    <div className={`w-full flex items-center text-xs font-medium border-b ${hasP0 ? 'bg-red-50 border-red-200' : 'bg-[#0f172a] border-[#1e293b]'}`}
      style={{ height: 36, zIndex: 50 }}>
      {/* Queue */}
      <button onClick={() => router.push('/admin/claw-queue')}
        className={`flex items-center gap-1.5 px-4 h-full border-r ${hasP0 ? 'border-red-200 text-red-800 hover:bg-red-100' : 'border-white/10 text-white/80 hover:bg-white/10'} transition-colors`}>
        <span className={queue.status === 'running' ? 'animate-pulse' : ''}>{queueIcon}</span>
        <span className="truncate max-w-[200px]">{queueLabel}</span>
      </button>
      {/* Next cron */}
      <button onClick={() => router.push('/admin/crons')}
        className={`flex items-center gap-1.5 px-4 h-full border-r ${hasP0 ? 'border-red-200 text-red-800 hover:bg-red-100' : 'border-white/10 text-white/60 hover:bg-white/10'} transition-colors`}>
        <span className="truncate max-w-[180px]">{cronLabel}</span>
      </button>
      {/* Errors */}
      <button onClick={() => router.push('/admin')}
        className={`flex items-center gap-1.5 px-4 h-full border-r ${hasP0 ? 'bg-red-600 text-white hover:bg-red-700' : 'border-white/10 text-white/60 hover:bg-white/10'} transition-colors`}>
        <span>{errLabel}</span>
      </button>
      {/* Patents */}
      <button onClick={() => router.push('/admin')}
        className={`flex items-center gap-1.5 px-4 h-full ml-auto ${hasP0 ? 'text-red-800 hover:bg-red-100' : 'text-white/60 hover:bg-white/10'} transition-colors`}
        title={`Provisional ready: ${patents.provisional_ready} · Filed: ${patents.filed}`}>
        <span>📊 {patents.active_count} patents</span>
      </button>
    </div>
  )
}
