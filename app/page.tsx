import Link from 'next/link'
import PattieDemoWidget from '@/components/PattieDemoWidget'
import HomepageHero from '@/components/HomepageHero'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-bold text-[#1a1f36]">⚖️ PatentPending</div>
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

      {/* Hero — UTM-aware, swaps headline based on utm_source */}
      <main className="max-w-6xl mx-auto px-6">
        <HomepageHero />

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-12">
          {[
            {
              icon: '💬',
              title: 'AI Patent Assistant',
              desc: 'Pattie turns a conversation into a structured patent draft. No legal jargon, no confusion.',
            },
            {
              icon: '⏰',
              title: 'Deadline Tracking',
              desc: 'Color-coded urgency alerts. Red = act now. Yellow = plan ahead. Green = safe.',
            },
            {
              icon: '🏪',
              title: 'IP Marketplace',
              desc: 'List your patent for licensing or sale. Qualified buyers find you — 10% on verified deals.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="p-6 border border-gray-100 rounded-xl hover:border-[#1a1f36]/20 transition-colors"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[#1a1f36] mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Patent Journey teaser */}
        <div className="border border-gray-100 rounded-2xl p-8 mb-16 text-center">
          <div className="text-3xl mb-3">🗺️</div>
          <h2 className="text-xl font-bold text-[#1a1f36] mb-2">Understand the Full Patent Journey</h2>
          <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">
            From invention disclosure to maintenance fees — 8 stages, explained in plain English.
            Interactive timeline with estimated timelines for each phase.
          </p>
          <Link
            href="/timeline"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a1f36] text-white rounded-xl text-sm font-semibold hover:bg-[#2d3561] transition-colors"
          >
            View the Patent Journey →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} Hot Hands LLC · PatentPending.app
        </div>
      </footer>

      {/* Floating Pattie demo widget — no login required */}
      <PattieDemoWidget />
    </div>
  )
}
