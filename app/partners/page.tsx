'use client'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-[#1a1f36] text-white px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-xs font-semibold uppercase tracking-widest text-white/70 mb-6">
            PatentPending Partner Program
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
            Add a patent revenue stream<br className="hidden sm:block" /> to your practice.
          </h1>
          <p className="text-lg text-white/70 mb-8 max-w-xl mx-auto">
            No upfront cost. No monthly fee. Earn on every client you bring in.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup?partner=true"
              className="px-8 py-4 bg-[#f5a623] text-[#1a1f36] rounded-xl font-bold text-base hover:bg-[#f5a623]/90 transition-colors"
            >
              Apply to Join →
            </Link>
            <Link
              href="#how-it-works"
              className="px-8 py-4 border border-white/30 text-white rounded-xl font-semibold text-base hover:bg-white/10 transition-colors"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1a1f36] text-center mb-3">How it works</h2>
          <p className="text-gray-500 text-center text-sm mb-10">Three steps, no administration overhead</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: '01', icon: '🔗', title: 'Refer', body: 'Share your unique referral link. When a prospective client visits your link and signs up, they&apos;re automatically connected to your account.' },
              { step: '02', icon: '⚖️', title: 'They file', body: 'PatentPending guides your client through the provisional patent process — AI-drafted claims, figures, cover sheet, and USPTO filing guidance.' },
              { step: '03', icon: '💳', title: 'You earn', body: 'When your referred client completes a paid filing, you earn 3 months of PatentPending Pro — automatically applied to your account.' },
            ].map(({ step, icon, title, body }) => (
              <div key={step} className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-gray-300 tracking-widest">{step}</span>
                  <span className="text-2xl">{icon}</span>
                </div>
                <h3 className="font-bold text-[#1a1f36] text-lg mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it&apos;s for ─────────────────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1a1f36] text-center mb-10">Who this is for</h2>
          <div className="space-y-5">
            {[
              {
                icon: '™',
                title: 'Trademark attorneys who don&apos;t do patents',
                body: 'You already have inventor clients asking about patents. Instead of turning them away, refer them to PatentPending and earn every time one files. Pure upside — no competition with your practice.',
              },
              {
                icon: '⚖️',
                title: 'Overloaded solo patent attorneys',
                body: 'You can&apos;t take every client who calls. PatentPending handles the AI-assisted prep work — claim drafts, figures, cover sheets — so you can focus on the matters that demand your expertise, while your referrals still benefit.',
              },
              {
                icon: '📚',
                title: 'Non-practicing and retired practitioners',
                body: 'Your credential still opens doors. Refer clients you&apos;re not actively representing and earn passive income without billable hour commitments.',
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="flex gap-5 p-6 border border-gray-200 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                <div className="w-12 h-12 flex-shrink-0 bg-[#1a1f36] text-white rounded-xl flex items-center justify-center text-xl font-bold">
                  {icon}
                </div>
                <div>
                  <h3 className="font-bold text-[#1a1f36] mb-1">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Earnings example ─────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-[#1a1f36] mb-3">Real earnings, real math</h2>
          <p className="text-gray-500 text-sm mb-8">No hidden minimums. No monthly fee to earn.</p>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4 text-left">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Example scenario</div>
            <div className="space-y-3">
              {[
                ['1 referred client files', '3 months Pro ($447 value)', 'bg-indigo-100 text-indigo-700'],
                ['2 clients file', '6 months Pro ($894 value)', 'bg-blue-100 text-blue-700'],
                ['4 clients file', '12 months Pro — full year free', 'bg-green-100 text-green-700'],
                ['8 clients file', '24 months Pro — 2 years free', 'bg-amber-100 text-amber-700'],
              ].map(([desc, reward, cls]) => (
                <div key={desc} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-700">{desc}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>{reward}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400">Rewards accrue per completed paid filing. Pro valued at $149/mo.</p>
        </div>
      </section>

      {/* ── Arc 3 teaser ─────────────────────────────────────────────────── */}
      <section className="py-14 px-4 bg-[#1a1f36] text-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-xs font-semibold uppercase tracking-widest text-white/60 mb-4">
            Arc 3 — Coming Soon
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">You&apos;re in early on something bigger</h2>
          <p className="text-white/70 text-base max-w-xl mx-auto">
            Every patent filed through your referral link participates in the PatentPending licensing marketplace. Revenue share for partners on licensing deals is on the way. Partners who join now are grandfathered into the Arc 3 program at the founding rate.
          </p>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-bold text-[#1a1f36] mb-3">Ready to get started?</h2>
          <p className="text-gray-500 text-sm mb-6">Applications take 2 minutes. We review within 1–2 business days.</p>
          <Link
            href="/signup?partner=true"
            className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-xl font-bold text-base hover:bg-[#2d3561] transition-colors"
          >
            Apply to Join →
          </Link>
          <p className="text-xs text-gray-400 mt-4">
            Already a partner?{' '}
            <Link href="/dashboard/partners" className="text-indigo-500 hover:underline">Go to your dashboard →</Link>
          </p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1a1f36] text-center mb-10">Questions we hear often</h2>
          <div className="space-y-5">
            {[
              {
                q: 'Is there a fee to join?',
                a: 'No. There is no cost to apply, no monthly fee, and no minimum referral requirement. You earn by referring — nothing else is required of you.',
              },
              {
                q: 'Do I retain ownership of my client relationships?',
                a: 'Completely. PatentPending does not contact your referred clients with competing legal services. You referred them; they remain your clients. We&apos;re a filing tool, not a law firm.',
              },
              {
                q: 'What happens if a client cancels or gets a refund?',
                a: 'Referral rewards are earned on completed paid filings — after the standard 48-hour refund window. If a filing is refunded, no reward is granted for that referral. Already-granted rewards are not clawed back.',
              },
              {
                q: 'Is this compliant with bar rules on attorney referrals?',
                a: 'We do not pay cash referral fees. Rewards are Pro subscription credits — software access, not money. That said, we encourage you to review your state&apos;s specific rules (Model Rule 7.2 or equivalent) before participating. When in doubt, consult your state bar.',
              },
              {
                q: 'Can I refer clients I&apos;m already representing?',
                a: 'Yes, with appropriate disclosure. If you&apos;re representing an inventor on other IP matters and they need patent filing, you can refer them to PatentPending for provisional preparation while continuing your own representation. The platforms don&apos;t conflict — PatentPending is a document preparation tool, not a legal services provider.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="bg-white border border-gray-200 rounded-xl overflow-hidden group">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer font-semibold text-[#1a1f36] text-sm list-none">
                  {q}
                  <span className="text-gray-400 text-lg leading-none group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">{a}</div>
              </details>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center mt-8">
            More questions? Email <a href="mailto:support@hotdeck.com" className="text-indigo-500 hover:underline">support@hotdeck.com</a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-4 text-center text-xs text-gray-400 border-t border-gray-100">
        <p>PatentPending.app — Hot Hands LLC · Lubbock, TX</p>
        <p className="mt-1">PatentPending.app is not a law firm. The Partner Program does not create attorney-client relationships between partners and PatentPending or its users.</p>
      </footer>
    </div>
  )
}
