import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Stop paying $15k in attorney fees — file patents yourself | PatentPending",
  description: "Built for DIY inventors. Pattie writes your patent draft, explains every step in plain English, and tracks your deadlines. Free to start.",
}

const FEATURES = [
  {
    icon: '💸',
    title: 'Save $10k–$15k',
    desc: "A standard utility patent costs $10k–$15k at a law firm. PatentPending costs a fraction. You write the same claims — Pattie just helps you get them right.",
  },
  {
    icon: '🧠',
    title: 'No legal jargon',
    desc: "Pattie explains patents in plain English. What's a claim? What's a provisional? She'll walk you through it, step by step.",
  },
  {
    icon: '📅',
    title: 'Deadline tracking',
    desc: "Miss a patent deadline and you lose your rights forever. PatentPending tracks every date and yells at you before it matters.",
  },
  {
    icon: '📄',
    title: 'Filing-ready drafts',
    desc: "Pattie produces structured patent applications with claims, abstract, and specification — ready to review before filing with the USPTO.",
  },
  {
    icon: '🔍',
    title: 'Prior art search',
    desc: "Know what's already patented before you spend months on a draft. PatentPending searches the prior art landscape for you.",
  },
  {
    icon: '🏪',
    title: 'Sell or license it',
    desc: "List your patent for licensing or acquisition once it's pending. Verified buyers find you through the marketplace.",
  },
]

const FAQS = [
  {
    q: 'Can I really file a patent without an attorney?',
    a: "Yes — inventors can file pro se (on their own) with the USPTO. It's totally legal. PatentPending helps you write a quality application; whether you hire an attorney to review it is your call.",
  },
  {
    q: "Is this actually legit or just hype?",
    a: "Fair skepticism. PatentPending is an AI-assisted drafting and management tool — not a magic button. You still need to understand your invention and review what Pattie writes. But it dramatically lowers the effort and cost.",
  },
  {
    q: "What's a provisional patent and why does it matter?",
    a: "A provisional patent application gives you 12 months of 'patent pending' status and locks in your filing date. It costs $320 vs $1,800+ for a full utility patent. Great first step.",
  },
  {
    q: 'Does PatentPending submit to the USPTO for me?',
    a: "We help you prepare filing-ready documents. USPTO submission is still your responsibility — we provide guidance for that step.",
  },
]

export default function RedditLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
          <div className="flex items-center gap-3">
            <Link href="/signup" className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors">
              Sign Up Free
            </Link>
            <Link href="/login" className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-6">
        <div className="pt-16 pb-12 text-center">
          <div className="inline-block px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium mb-6 border border-orange-200">
            Hey r/inventors 👋
          </div>
          <h1 className="text-5xl font-bold text-[#1a1f36] mb-6 leading-tight max-w-3xl mx-auto">
            Built for inventors who don&apos;t want to pay $15k in attorney fees
          </h1>
          <p className="text-xl text-gray-500 mb-4 max-w-2xl mx-auto">
            You had the idea. You did the work. Why hand a law firm $15,000 for paperwork?
          </p>
          <p className="text-lg text-gray-400 mb-10 max-w-xl mx-auto">
            Pattie (our AI) helps you write patent applications in plain English, tracks your deadlines, and explains every step — no legal background needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/signup"
              className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
            >
              Try it free — no credit card →
            </Link>
            <Link
              href="/demo"
              className="inline-block px-8 py-4 border border-gray-200 text-gray-600 rounded-lg font-semibold text-lg hover:border-gray-400 transition-colors"
            >
              See how it works
            </Link>
          </div>
          <p className="text-sm text-gray-400 mt-4">Free plan available · No credit card required</p>
        </div>

        {/* Social proof strip */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6 mb-16 text-center">
          <p className="text-orange-800 text-sm font-medium">
            💬 &quot;I was quoted $12,000 by a patent attorney. Used PatentPending instead and filed my provisional in a weekend.&quot;
          </p>
          <p className="text-orange-500 text-xs mt-1">— Early inventor user</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-16">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 border border-gray-100 rounded-xl hover:border-orange-200 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[#1a1f36] mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="pb-16">
          <h2 className="text-3xl font-bold text-[#1a1f36] text-center mb-10">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '1', label: 'Describe your invention', desc: 'Chat with Pattie. She asks the right questions to understand what makes your invention novel.' },
              { step: '2', label: 'Review your draft', desc: 'Pattie generates a structured patent application — claims, abstract, specification. You review and refine.' },
              { step: '3', label: 'Track your deadlines', desc: 'Every key date is tracked automatically. Never miss a provisional conversion or maintenance fee.' },
              { step: '4', label: 'File or get help', desc: 'File yourself or connect with a vetted attorney for a final review. Your choice.' },
            ].map((s) => (
              <div key={s.step} className="text-center p-4">
                <div className="w-10 h-10 rounded-full bg-[#1a1f36] text-white font-bold text-lg flex items-center justify-center mx-auto mb-3">{s.step}</div>
                <h4 className="font-semibold text-[#1a1f36] mb-1 text-sm">{s.label}</h4>
                <p className="text-gray-500 text-xs">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="pb-16 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1a1f36] text-center mb-8">Real talk</h2>
          <div className="space-y-6">
            {FAQS.map((faq) => (
              <div key={faq.q} className="border-b border-gray-100 pb-6">
                <h4 className="font-semibold text-[#1a1f36] mb-2">{faq.q}</h4>
                <p className="text-gray-500 text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center pb-20">
          <h2 className="text-3xl font-bold text-[#1a1f36] mb-4">Ready to file smarter?</h2>
          <p className="text-gray-500 mb-8">Create a free account and start your first patent draft today.</p>
          <Link
            href="/signup"
            className="inline-block px-10 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
          >
            Get started free →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-5xl mx-auto px-6 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} Hot Hands LLC · PatentPending.app ·{' '}
          <Link href="/about" className="hover:text-gray-600">About</Link> ·{' '}
          <Link href="/pricing" className="hover:text-gray-600">Pricing</Link>
        </div>
      </footer>
    </div>
  )
}
