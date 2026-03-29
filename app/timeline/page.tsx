import Link from 'next/link'
import PatentJourneyTimeline from '@/components/PatentJourneyTimeline'

export const metadata = {
  title: 'The Patent Journey · PatentPending.app',
  description:
    'See the full patent process from invention disclosure to maintenance — 8 stages, plainly explained. PatentPending guides you every step of the way.',
  openGraph: {
    title: 'The Patent Journey · PatentPending.app',
    description:
      'From idea to issued patent — understand the full USPTO process in plain English.',
    url: 'https://patentpending.app/timeline',
    siteName: 'PatentPending',
    type: 'website',
  },
}

export default function TimelinePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-[#1a1f36]">
            ⚖️ PatentPending
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/signup"
              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors"
            >
              Sign Up Free
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-5">
            🗺️ The Patent Journey
          </div>
          <h1 className="text-4xl font-extrabold text-[#1a1f36] mb-4 leading-tight">
            From Idea to Issued Patent
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            The patent process has 8 distinct stages — from capturing your invention to paying
            maintenance fees on a granted patent. Here&apos;s exactly what to expect.
          </p>
        </div>

        {/* Interactive Timeline */}
        <div className="mb-12">
          <PatentJourneyTimeline demoMode={true} />
          <p className="text-center text-sm text-gray-400 mt-3">
            ↑ Click any stage to learn more about what happens there
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-14">
          {[
            { label: 'Average time to grant', value: '2–3 years', icon: '⏱️' },
            { label: 'USPTO provisional fee', value: '$320', sub: 'micro entity', icon: '💸' },
            { label: 'NP filing window', value: '12 months', sub: 'from provisional', icon: '📅' },
            { label: 'Patent term', value: '20 years', sub: 'from NP filing date', icon: '🔑' },
          ].map((stat) => (
            <div key={stat.label} className="border border-gray-100 rounded-xl p-4 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-xl font-extrabold text-[#1a1f36]">{stat.value}</div>
              {stat.sub && <div className="text-xs text-gray-400 mt-0.5">{stat.sub}</div>}
              <div className="text-xs text-gray-500 mt-1 leading-tight">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Explainer sections */}
        <div className="grid md:grid-cols-2 gap-6 mb-14">
          <div className="border border-gray-100 rounded-xl p-6">
            <div className="text-2xl mb-3">💡</div>
            <h3 className="font-bold text-[#1a1f36] mb-2">Why file a provisional first?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              A provisional application establishes your priority date immediately — often in days,
              not months. It&apos;s faster, cheaper, and lets you say &ldquo;Patent Pending&rdquo; while you refine
              your invention and raise funding. You have 12 months to file the full non-provisional.
            </p>
          </div>
          <div className="border border-gray-100 rounded-xl p-6">
            <div className="text-2xl mb-3">📬</div>
            <h3 className="font-bold text-[#1a1f36] mb-2">What is an Office Action?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              An Office Action is a letter from your USPTO examiner raising objections or rejections.
              It&apos;s completely normal — most applications receive at least one. You have 3 months to
              respond (extendable to 6). PatentPending helps you track and respond to each one.
            </p>
          </div>
          <div className="border border-gray-100 rounded-xl p-6">
            <div className="text-2xl mb-3">🏛️</div>
            <h3 className="font-bold text-[#1a1f36] mb-2">How long does examination take?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              USPTO examination typically takes 18–36 months from your non-provisional filing date.
              The first Office Action usually arrives within 16–18 months. Track your application
              status in USPTO&apos;s Patent Center or PatentPending.
            </p>
          </div>
          <div className="border border-gray-100 rounded-xl p-6">
            <div className="text-2xl mb-3">🔑</div>
            <h3 className="font-bold text-[#1a1f36] mb-2">Maintenance fees — don&apos;t forget!</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Utility patents require maintenance fee payments at 3.5, 7.5, and 11.5 years after
              grant. Missing a payment results in patent expiration. PatentPending tracks these
              deadlines so nothing slips through the cracks.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[#1a1f36] rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-extrabold mb-3">Ready to start your patent journey?</h2>
          <p className="text-gray-300 mb-6 max-w-lg mx-auto text-sm leading-relaxed">
            PatentPending guides you through every stage — from your first invention disclosure to
            filing at USPTO. AI-powered claims drafting, deadline tracking, and more.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/signup"
              className="px-6 py-3 bg-white text-[#1a1f36] rounded-xl font-bold text-sm hover:bg-gray-100 transition-colors"
            >
              Start for Free →
            </Link>
            <Link
              href="/demo"
              className="px-6 py-3 border border-white/30 text-white rounded-xl font-bold text-sm hover:bg-white/10 transition-colors"
            >
              See the Demo
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 mt-12">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span>© {new Date().getFullYear()} Hot Hands LLC · PatentPending.app</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-gray-600">Home</Link>
            <Link href="/blog" className="hover:text-gray-600">Blog</Link>
            <Link href="/pricing" className="hover:text-gray-600">Pricing</Link>
            <Link href="/signup" className="hover:text-gray-600">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
