'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ScoreData {
  title: string; filing_date: string | null; status: string; slug: string
  novelty_score: number | null; viability_score: number | null; complexity_score: number | null
  composite_score: number | null; summary: string | null
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-300">{label}</span>
        <span className="text-sm font-bold text-white">{value ?? '—'}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full transition-all"
          style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

function ScoreCircle({ score }: { score: number | null }) {
  const s = score ?? 0
  const color = s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center my-6">
      <div style={{ borderColor: color }}
        className="w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center bg-white/5">
        <span style={{ color }} className="text-4xl font-black leading-none">{score ?? '—'}</span>
        <span className="text-xs text-gray-400 mt-1">/100</span>
      </div>
      <span className="text-xs text-gray-500 mt-2 font-semibold tracking-widest uppercase">PatentScore™</span>
    </div>
  )
}

export default function ScoreCardClient({ params }: { params: Promise<{ slug: string }> }) {
  const [data, setData] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slug, setSlug] = useState('')

  useEffect(() => {
    params.then(({ slug: s }) => {
      setSlug(s)
      fetch(`/api/p/${s}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { setData(d); setLoading(false) })
        .catch(() => { setError(true); setLoading(false) })
    })
  }, [params])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://patentpending.app/p/${slug}`

  if (loading) return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-gray-400 text-sm animate-pulse">Loading score card…</div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center gap-4">
      <p className="text-gray-400 text-sm">This score card is private or doesn't exist.</p>
      <Link href="https://patentpending.app" className="text-indigo-400 hover:underline text-sm">
        File your patent at patentpending.app →
      </Link>
    </div>
  )

  const tweetText = `My invention just scored ${data.composite_score}/100 on patentpending.app's PatentScore™ 🔬 File your own patent → ${shareUrl}`
  const linkedinText = `Excited to share — my invention "${data.title}" scored ${data.composite_score}/100 on the PatentScore™ index at patentpending.app. Independent inventors: you don't need a $10K lawyer to protect your ideas. ${shareUrl}`
  const filedYear = data.filing_date ? new Date(data.filing_date).getFullYear() : null

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 shadow-2xl">
          {/* Badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔒</span>
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Patent Pending</span>
          </div>

          {/* Title */}
          <h1 className="text-lg font-bold text-white leading-snug mb-1">{data.title}</h1>
          <p className="text-xs text-gray-500 mb-1">
            {filedYear ? `Filed ${filedYear}` : 'Filed'}
            {' · '}patentpending.app
          </p>

          {/* Score circle */}
          <ScoreCircle score={data.composite_score} />

          {/* Sub-scores */}
          <ScoreBar label="Novelty" value={data.novelty_score} />
          <ScoreBar label="Viability" value={data.viability_score} />
          <ScoreBar label="Complexity" value={data.complexity_score} />

          {/* Summary */}
          {data.summary && (
            <p className="text-xs text-gray-400 italic mt-4 border-t border-white/10 pt-4 leading-relaxed">
              &ldquo;{data.summary}&rdquo;
            </p>
          )}

          {/* CTA */}
          <div className="mt-5 pt-4 border-t border-white/10 text-center">
            <Link href="https://patentpending.app"
              className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 transition-colors">
              Protect your invention → patentpending.app
            </Link>
          </div>
        </div>

        {/* Share buttons */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Share your PatentScore™</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
              target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 bg-[#1d9bf0] text-white text-xs font-semibold rounded-lg hover:opacity-90">
              🐦 Tweet This
            </a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(linkedinText)}`}
              target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 bg-[#0077b5] text-white text-xs font-semibold rounded-lg hover:opacity-90">
              💼 LinkedIn
            </a>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="px-4 py-2 bg-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/20">
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
