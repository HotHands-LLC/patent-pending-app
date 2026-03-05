'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function SuccessContent() {
  const params = useSearchParams()
  const sessionId = params.get('session_id')
  const [dots, setDots] = useState('.')

  // Animate dots while claims are generating
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 600)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>✅</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f4f4f5', marginBottom: 12 }}>
          Payment confirmed — your claims draft is generating
        </h1>
        <p style={{ fontSize: 14, color: '#71717a', lineHeight: 1.7, marginBottom: 28 }}>
          This takes 1–2 minutes. You can close this tab —<br />
          your draft will be ready in your dashboard.
        </p>

        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: '16px 20px', marginBottom: 28, textAlign: 'left' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#52525b', marginBottom: 10 }}>What happens next</div>
          {[
            ['⚡', 'AI drafts independent + dependent claims from your intake'],
            ['📋', 'Claims appear in your patent dashboard when ready'],
            ['✏️', 'You review, approve, or request revisions'],
            ['📬', 'Full filing package assembled for USPTO submission'],
          ].map(([icon, text], i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>

        <Link
          href="/dashboard"
          style={{ display: 'inline-block', padding: '12px 32px', background: '#059669', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
        >
          Go to Dashboard →
        </Link>

        {sessionId && (
          <p style={{ fontSize: 10, color: '#27272a', marginTop: 20 }}>
            Session: {sessionId.slice(0, 20)}…
          </p>
        )}
      </div>
    </div>
  )
}

export default function IntakeSuccessPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#09090b' }} />}>
      <SuccessContent />
    </Suspense>
  )
}
