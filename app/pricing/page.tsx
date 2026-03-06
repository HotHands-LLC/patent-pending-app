import Link from 'next/link'

export default function PricingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#f4f4f5', fontFamily: 'inherit' }}>
      <div style={{ borderBottom: '1px solid #18181b', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/dashboard" style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5', textDecoration: 'none' }}>⚖️ PatentPending</Link>
        <Link href="/dashboard" style={{ fontSize: 12, color: '#52525b' }}>← Back to Dashboard</Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 20 }}>
            ⚡ Coming Soon
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#f4f4f5', margin: '0 0 12px', letterSpacing: '-0.03em' }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontSize: 16, color: '#71717a', margin: 0 }}>
            Pro features are in active development. Join the waitlist to get early access.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
          {/* Free tier */}
          <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 16, padding: '28px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#71717a', marginBottom: 8 }}>FREE</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f4f4f5', marginBottom: 4 }}>$49 <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>one-time</span></div>
            <p style={{ fontSize: 13, color: '#71717a', marginBottom: 20 }}>Per invention — no subscription.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['AI-generated claims draft', 'Smart Handoff upload', '1 revision round', 'Filing readiness score', 'Correspondence tracking'].map(f => (
                <li key={f} style={{ fontSize: 13, color: '#d4d4d8', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#059669' }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/intake/new" style={{ display: 'block', padding: '12px', borderRadius: 8, background: '#27272a', color: '#f4f4f5', textAlign: 'center', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Start Free →
            </Link>
          </div>

          {/* Pro tier */}
          <div style={{ background: '#18181b', border: '1px solid rgba(245,158,11,0.5)', borderRadius: 16, padding: '28px 24px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#f59e0b', color: '#1a1a1a', fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 20, letterSpacing: '0.1em' }}>COMING SOON</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>⚡ PRO</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f4f4f5', marginBottom: 4 }}>$149 <span style={{ fontSize: 14, fontWeight: 400, color: '#71717a' }}>one-time</span></div>
            <p style={{ fontSize: 13, color: '#71717a', marginBottom: 20 }}>Everything in Free, plus:</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['Deep Research Pass (12-min Gemini)', 'Claude Language Refinement Pass', 'Unlimited revision rounds', 'Prior art search report', 'Attorney-quality spec drafting', 'Drawing generation (coming)'].map(f => (
                <li key={f} style={{ fontSize: 13, color: '#d4d4d8', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#f59e0b' }}>⚡</span> {f}
                </li>
              ))}
            </ul>
            <button disabled style={{ display: 'block', width: '100%', padding: '12px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontSize: 13, fontWeight: 600, cursor: 'not-allowed' }}>
              Join Waitlist →
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#3f3f46' }}>
          Pro tier pricing and features subject to change. Waitlist members get locked-in pricing.
        </p>
      </div>
    </div>
  )
}
