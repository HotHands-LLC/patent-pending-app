import Link from 'next/link'
import PattieDemoWidget from '@/components/PattieDemoWidget'
import PattieCTAButton from '@/components/PattieCTAButton'

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

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6">
        <div className="pt-20 pb-16 text-center">
          <div className="inline-block px-3 py-1 bg-[#f5a623]/10 text-[#f5a623] rounded-full text-sm font-medium mb-6 border border-[#f5a623]/20">
            AI-powered patent assistant
          </div>
          <h1 className="text-5xl font-bold text-[#1a1f36] mb-6 leading-tight">
            File Patents with Confidence
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Pattie guides you from idea to filing-ready draft. Track deadlines, manage your portfolio, and connect with buyers — all in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/signup"
              className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
            >
              Start for Free →
            </Link>
            <PattieCTAButton />
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-20">
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
