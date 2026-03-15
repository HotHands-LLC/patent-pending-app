import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-bold text-[#1a1f36]">⚖️ PatentPending</div>
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-[#1a1f36] transition-colors">
              Pricing
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
          <div className="inline-block px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-sm font-medium mb-6 border border-indigo-100">
            Patent filing, simplified.
          </div>
          <h1 className="text-5xl font-bold text-[#1a1f36] mb-6 leading-tight">
            File your patent.<br />Protect your idea.
          </h1>
          <p className="text-xl text-gray-500 mb-4 max-w-2xl mx-auto">
            PatentPending guides you through the entire patent process — from first idea to USPTO filing — with AI-powered help every step of the way. No attorney required.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Link
              href="/login"
              className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
            >
              Start for free →
            </Link>
            <a
              href="#how-it-works"
              className="text-gray-500 hover:text-[#1a1f36] text-sm font-medium transition-colors"
            >
              See how it works ↓
            </a>
          </div>

          {/* Trust line */}
          <p className="text-sm text-gray-400">
            Join inventors who&apos;ve filed patents without an attorney — starting at $0.
          </p>
        </div>

        {/* Value Props */}
        <div id="how-it-works" className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-20">
          {[
            {
              icon: '📄',
              title: 'File your own patent',
              desc: 'Pattie, our AI patent assistant, walks you through every section — abstract, specification, claims, and drawings — and helps you get it right.',
            },
            {
              icon: '💡',
              title: 'Plain language, every step',
              desc: 'No legalese. Pattie explains what each part of your patent does, why it matters, and what the USPTO is looking for.',
            },
            {
              icon: '🔒',
              title: 'From idea to marketplace',
              desc: 'Once your patent is filed, list it on our marketplace to attract licensees and buyers — or keep it private while you build.',
            },
          ].map((f) => (
            <div key={f.title} className="p-6 border border-gray-100 rounded-xl hover:border-[#1a1f36]/20 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[#1a1f36] mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} PatentPending · <a href="mailto:support@patentpending.app" className="hover:underline">support@patentpending.app</a>
        </div>
      </footer>
    </div>
  )
}
