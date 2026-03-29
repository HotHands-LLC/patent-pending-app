import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "The AI Patent Platform for Serious Inventors & Founders | PatentPending",
  description: "Build an IP portfolio that protects your competitive moat, impresses investors, and moves at startup speed. AI-powered drafting, deadline tracking, and IP marketplace.",
}

const FEATURES = [
  {
    icon: '🏰',
    title: 'Protect your moat',
    desc: "IP is a competitive barrier. PatentPending helps you identify what's patentable, draft strong claims, and build a portfolio that keeps competitors out.",
  },
  {
    icon: '📊',
    title: 'Portfolio visibility',
    desc: "Track every patent — from invention to grant — in one dashboard. Status, deadlines, assignees, and licensing all in one place.",
  },
  {
    icon: '💼',
    title: 'Investor-ready IP',
    desc: "Due diligence happens fast. PatentPending keeps your IP portfolio organized and presentable when the term sheet hits.",
  },
  {
    icon: '⚡',
    title: 'Startup speed',
    desc: "File provisionals in days, not months. Pattie drafts, you refine, you file. No waiting weeks for an attorney's calendar.",
  },
  {
    icon: '🤝',
    title: 'Team collaboration',
    desc: "Invite co-inventors, attorneys, and collaborators. Control access at the patent level. Everyone sees exactly what they need.",
  },
  {
    icon: '💰',
    title: 'Monetize your IP',
    desc: "List patents for licensing or acquisition on the PatentPending marketplace. 10% on verified deals. Passive revenue from your portfolio.",
  },
]

const SOCIAL_PROOF = [
  { stat: '10x', label: 'faster than traditional attorney drafting' },
  { stat: '$0', label: 'to start — no credit card required' },
  { stat: '100%', label: 'yours — we never own your IP' },
]

export default function LinkedInLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors hidden sm:inline">
              Pricing
            </Link>
            <Link href="/signup" className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors">
              Sign Up Free
            </Link>
            <Link href="/login" className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6">
        {/* Hero */}
        <div className="pt-16 pb-12 text-center">
          <div className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium mb-6 border border-blue-200">
            IP strategy for founders &amp; innovators
          </div>
          <h1 className="text-5xl font-bold text-[#1a1f36] mb-6 leading-tight max-w-3xl mx-auto">
            The AI patent platform for serious inventors
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Build an IP portfolio that protects your competitive moat, impresses investors, and moves at startup speed. Pattie handles drafting, deadlines, and portfolio management — so you can focus on building.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/signup"
              className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
            >
              Get started free →
            </Link>
            <Link
              href="/pricing"
              className="inline-block px-8 py-4 border border-gray-200 text-gray-600 rounded-lg font-semibold text-lg hover:border-gray-400 transition-colors"
            >
              View pricing →
            </Link>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-6 mb-16">
          {SOCIAL_PROOF.map((s) => (
            <div key={s.label} className="text-center p-6 bg-gray-50 rounded-2xl">
              <div className="text-3xl font-extrabold text-[#1a1f36] mb-1">{s.stat}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-16">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 border border-gray-100 rounded-xl hover:border-blue-200 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[#1a1f36] mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Use cases */}
        <div className="pb-16">
          <h2 className="text-3xl font-bold text-[#1a1f36] text-center mb-10">Built for every stage</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                stage: 'Pre-seed / Idea stage',
                desc: "File a provisional to lock your date while you build. 12 months of 'patent pending' status. Costs a fraction of a full application.",
                cta: 'Start with a provisional →',
                href: '/signup',
              },
              {
                stage: 'Seed / Series A',
                desc: "Clean up your IP before due diligence. Organize your portfolio, add co-inventors, and make sure every patent is tracked and up to date.",
                cta: 'Organize your portfolio →',
                href: '/signup',
              },
              {
                stage: 'Growth / Exit',
                desc: "Monetize through licensing or position your IP portfolio for an acquisition. PatentPending's marketplace connects you with qualified buyers.",
                cta: 'Explore the marketplace →',
                href: '/marketplace',
              },
            ].map((uc) => (
              <div key={uc.stage} className="p-6 border border-gray-200 rounded-xl bg-gray-50">
                <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">{uc.stage}</div>
                <p className="text-gray-600 text-sm mb-4">{uc.desc}</p>
                <Link href={uc.href} className="text-sm font-semibold text-[#1a1f36] hover:text-blue-700 transition-colors">
                  {uc.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-20 border-t border-gray-100 pt-16">
          <h2 className="text-3xl font-bold text-[#1a1f36] mb-4">Your IP portfolio starts here</h2>
          <p className="text-gray-500 mb-8 max-w-xl mx-auto">
            Create a free account. Start your first patent draft. Build the IP position your company deserves.
          </p>
          <Link
            href="/signup"
            className="inline-block px-10 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
          >
            Get started free →
          </Link>
          <p className="text-sm text-gray-400 mt-4">No credit card required · Free plan available</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-5xl mx-auto px-6 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} Hot Hands LLC · PatentPending.app ·{' '}
          <Link href="/about" className="hover:text-gray-600">About</Link> ·{' '}
          <Link href="/pricing" className="hover:text-gray-600">Pricing</Link> ·{' '}
          <Link href="/marketplace" className="hover:text-gray-600">Marketplace</Link>
        </div>
      </footer>
    </div>
  )
}
