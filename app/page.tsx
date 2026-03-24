import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-bold text-[#1a1f36]">⚖️ PatentPending</div>
          <Link
            href="/login"
            className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6">
        <div className="pt-20 pb-16 text-center">
          <div className="inline-block px-3 py-1 bg-[#f5a623]/10 text-[#f5a623] rounded-full text-sm font-medium mb-6 border border-[#f5a623]/20">
            Hot Hands LLC — Internal Patent Dashboard
          </div>
          <h1 className="text-5xl font-bold text-[#1a1f36] mb-6 leading-tight">
            Manage Your Patents<br />Like a Pro
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Track every provisional, monitor USPTO status in real-time, and never miss a deadline. Your patent portfolio, organized.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
          >
            Access Dashboard →
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-20">
          {[
            {
              icon: '📋',
              title: 'Patent Registry',
              desc: 'All your patents in one place. Provisional numbers, filing dates, status badges.'
            },
            {
              icon: '⏰',
              title: 'Deadline Tracking',
              desc: 'Color-coded urgency alerts. Red = act now. Yellow = plan ahead. Green = safe.'
            },
            {
              icon: '🔍',
              title: 'USPTO Live Status',
              desc: 'Real-time lookup via USPTO ODP API. Know exactly where your application stands.'
            }
          ].map((f) => (
            <div key={f.title} className="p-6 border border-gray-100 rounded-xl hover:border-[#1a1f36]/20 transition-colors">
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
    </div>
  )
}
