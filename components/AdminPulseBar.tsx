'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface PulseData {
  queueStatus: string
  queueState: 'running' | 'idle' | 'paused' | 'clear'
  nextCron: { label: string; minutesUntil: number } | null
  errorCount: number
  patentCount: number
}

export default function AdminPulseBar() {
  const [pulse, setPulse] = useState<PulseData | null>(null)
  const [token, setToken] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setToken(session.access_token)
      fetchPulse(session.access_token)
    })
  }, [])

  useEffect(() => {
    if (!token) return
    const interval = setInterval(() => fetchPulse(token), 10000)
    return () => clearInterval(interval)
  }, [token])

  async function fetchPulse(t: string) {
    try {
      const res = await fetch('/api/admin/pulse', { headers: { Authorization: `Bearer ${t}` } })
      if (res.ok) setPulse(await res.json())
    } catch { /* non-critical */ }
  }

  if (!pulse) return null

  const queueDot = pulse.queueState === 'running' ? '🟢' : pulse.queueState === 'idle' ? '💤' : pulse.queueState === 'paused' ? '⏸️' : '✅'

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-9 bg-[#0f1117] border-b border-white/10 flex items-center px-4 gap-0 text-[11px] font-mono text-white/70 overflow-hidden">
      {/* Queue status */}
      <Link href="/admin/claw-queue" className="flex items-center gap-1.5 hover:text-white transition-colors shrink-0 min-w-0 flex-1">
        <span>{queueDot}</span>
        <span className="truncate">{pulse.queueStatus}</span>
      </Link>

      <div className="w-px h-5 bg-white/10 mx-3 shrink-0" />

      {/* Next cron */}
      <Link href="/admin/crons" className="flex items-center gap-1.5 hover:text-white transition-colors shrink-0">
        <span>⏰</span>
        {pulse.nextCron ? (
          <span className="whitespace-nowrap">
            {pulse.nextCron.label} · {pulse.nextCron.minutesUntil < 60
              ? `${pulse.nextCron.minutesUntil}m`
              : `${Math.floor(pulse.nextCron.minutesUntil / 60)}h`}
          </span>
        ) : <span>—</span>}
      </Link>

      <div className="w-px h-5 bg-white/10 mx-3 shrink-0" />

      {/* Errors */}
      <Link href="/admin" className={`flex items-center gap-1.5 hover:text-white transition-colors shrink-0 ${pulse.errorCount > 0 ? 'text-red-400' : ''}`}>
        {pulse.errorCount > 0 ? `🔴 ${pulse.errorCount} error${pulse.errorCount !== 1 ? 's' : ''}` : '✅ No errors'}
      </Link>

      <div className="w-px h-5 bg-white/10 mx-3 shrink-0" />

      {/* Patents */}
      <span className="flex items-center gap-1.5 shrink-0 hidden sm:flex">
        📋 {pulse.patentCount} patent{pulse.patentCount !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
