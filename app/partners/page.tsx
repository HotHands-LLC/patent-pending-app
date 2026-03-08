'use client'
import Link from 'next/link'

export default function PartnersLandingPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"Georgia", serif' }}>
      {/* Nav */}
      <nav style={{ fontFamily: 'system-ui, sans-serif' }}
        className="bg-[#1a1f36] text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">⚖️ PatentPending</Link>
        <div className="flex gap-4 items-center">
          <Link href="/login" className="text-sm text-white/70 hover:text-white">Sign In</Link>
          <Link href="/partners/apply"
            className="text-sm bg-white text-[#1a1f36] font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            Apply Now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-6 pt-20 pb-16">
        <div className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-4"
          style={{ fontFamily: 'system-ui, sans-serif' }}>
          Partner Program
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-[#1a1f36] mb-6 leading-tight">
          Add a patent revenue stream<br />to your practice.
        </h1>
        <p className="text-xl text-gray-600 mb-3">
          No upfront cost. No monthly fee. Earn on every client you bring in.
        </p>
        <p className="text-base text-gray-500 mb-10">
          PatentPending's Partner Program is built for attorneys who want to expand their IP offering without taking on patent prosecution themselves. You refer — we prepare — your clients file. You earn Pro credits for every completed filing.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/partners/apply"
            className="inline-flex items-center px-7 py-4 bg-[#1a1f36] text-white text-base font-semibold rounded-xl hover:bg-[#2d3561] transition-colors"
            style={{ fontFamily: 'system-ui, sans-serif' }}>
            Apply to Join →
          </Link>
          <Link href="/login"
            className="inline-flex items-center px-7 py-4 border border-gray-300 text-gray-700 text-base font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            style={{ fontFamily: 'system-ui, sans-serif' }}>
            Sign In
          </Link>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* How it works */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-[#1a1f36] mb-10">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { n: '1', title: 'Refer', body: 'Share your unique referral link with clients who need a provisional patent. It takes 30 seconds — add it to your email signature.' },
            { n: '2', title: 'They file', body: 'Your client prepares their provisional application using our AI-assisted tools, then files directly with the USPTO. We handle the preparation; they own the filing.' },
            { n: '3', title: 'You earn', body: 'When their filing is complete and payment clears, your account is automatically credited with 3 months of PatentPending Pro — no invoicing, no manual tracking.' },
          ].map(s => (
            <div key={s.n}>
              <div className="text-3xl font-bold text-indigo-600 mb-3" style={{ fontFamily: 'system-ui, sans-serif' }}>{s.n}.</div>
              <div className="text-lg font-bold text-[#1a1f36] mb-2">{s.title}</div>
              <p className="text-gray-600 text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Who it's for */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-[#1a1f36] mb-10">Who it's for</h2>
        <div className="space-y-8">
          {[
            {
              title: 'Trademark attorneys who don\'t do patents',
              body: 'Your clients have ideas they want to protect but you don\'t practice patent law. Rather than refer them out cold, give them a structured path — and earn something for your introduction. This is pure upside with no income threat.',
            },
            {
              title: 'Solo patent attorneys who are at capacity',
              body: 'You can\'t take every provisional that walks in the door. PatentPending handles the preparation so clients have organized, well-drafted provisional applications before they ever need to hire you for a non-provisional. You get better-prepared clients — or refer provisionals you can\'t fit and earn credits on the volume.',
            },
            {
              title: 'Non-practicing attorneys seeking passive income',
              body: 'If you\'ve stepped back from active practice but maintain your bar license, your network still has value. The referral program requires no legal work on your part — just introductions. Pro months convert to real money ($149/month value) or can be gifted to clients.',
            },
          ].map(s => (
            <div key={s.title} className="border-l-2 border-indigo-100 pl-5">
              <h3 className="text-base font-bold text-[#1a1f36] mb-1">{s.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Earnings example */}
      <div className="max-w-3xl mx-auto px-6 py-16 bg-indigo-50 rounded-2xl my-8 mx-6">
        <h2 className="text-2xl font-bold text-[#1a1f36] mb-4">What you actually earn</h2>
        <p className="text-gray-600 mb-6">The math is simple. Each completed filing from your referral link earns you 3 months of Pro access ($447 value at $149/month).</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6" style={{ fontFamily: 'system-ui, sans-serif' }}>
          {[
            { clients: '1', months: '3 months', value: '$447' },
            { clients: '4', months: '12 months', value: '$1,788' },
            { clients: '10', months: '30 months', value: '$4,470' },
            { clients: '20', months: '5 years', value: '$8,940' },
          ].map(r => (
            <div key={r.clients} className="bg-white rounded-xl border border-indigo-100 p-4 text-center">
              <div className="text-2xl font-bold text-[#1a1f36] mb-1">{r.clients}</div>
              <div className="text-xs text-gray-500 mb-2">client{r.clients !== '1' ? 's' : ''} filed</div>
              <div className="text-sm font-semibold text-indigo-600">{r.months} Pro</div>
              <div className="text-xs text-gray-400">{r.value} value</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Pro months earned have no cash value at this time. Cash payout program planned for a future release.
        </p>
      </div>

      {/* Arc 3 teaser */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-[#1a1f36] text-white rounded-2xl p-8">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3"
            style={{ fontFamily: 'system-ui, sans-serif' }}>
            ⚡ Coming Soon — Arc 3
          </div>
          <h2 className="text-2xl font-bold mb-3">Patent licensing revenue share for partners.</h2>
          <p className="text-white/70 leading-relaxed">
            Every patent filed through your referral link will participate in PatentPending's licensing marketplace. When a patent is licensed or sold through our platform, partners in our network participate in the revenue. The details are still in development — but partners who are active before launch will be first in line when it ships.
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-[#1a1f36] mb-8">Frequently asked questions</h2>
        <div className="space-y-6">
          {[
            {
              q: 'Does this create an attorney-client relationship with PatentPending?',
              a: 'No. PatentPending is a preparation platform, not a law firm. Your clients retain you for legal counsel and file their own applications at the USPTO. We provide the tools. You provide the judgment.',
            },
            {
              q: 'Do I own my clients?',
              a: 'Yes. Referring someone through your link doesn\'t create any obligation for them to use your services. Your client relationship is yours. We simply help them prepare their provisional — if they later need prosecution help on a non-provisional, that\'s a natural referral back to you.',
            },
            {
              q: 'What happens if a referred client requests a refund?',
              a: 'Referrals qualify after a 48-hour payment clearance window. If a client refunds within that window, the referral doesn\'t qualify. After 48 hours, the reward is credited and is not reversed.',
            },
            {
              q: 'Is this compliant with bar rules on referral fees?',
              a: 'This program pays no cash referral fees. Rewards are Pro subscription credits for the referring attorney\'s own account — not a fee for referring a client. We recommend confirming with your state bar\'s ethics rules, but this structure is designed to avoid referral fee restrictions under Model Rule 7.2.',
            },
            {
              q: 'How do I track my referrals?',
              a: 'Partners get a dedicated dashboard at /dashboard/partners. You can see every client who signed up through your link, their patent status, filing progress, and your earnings history.',
            },
          ].map(faq => (
            <div key={faq.q} className="border-b border-gray-100 pb-6">
              <h3 className="text-base font-bold text-[#1a1f36] mb-2">{faq.q}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-[#1a1f36] mb-3">Ready to start?</h2>
          <p className="text-gray-600 mb-8">Applications are reviewed within 1–2 business days. Approval comes with your referral link, a partner dashboard, and your first year of Pro access.</p>
          <Link href="/partners/apply"
            className="inline-flex items-center px-8 py-4 bg-[#1a1f36] text-white text-base font-semibold rounded-xl hover:bg-[#2d3561] transition-colors"
            style={{ fontFamily: 'system-ui, sans-serif' }}>
            Apply to Join →
          </Link>
          <p className="mt-4 text-sm text-gray-400">Questions? Email <a href="mailto:support@hotdeck.com" className="text-indigo-600 hover:underline">support@hotdeck.com</a></p>
        </div>
      </div>
    </div>
  )
}
