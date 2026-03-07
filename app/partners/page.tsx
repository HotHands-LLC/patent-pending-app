'use client'

import Link from 'next/link'

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-indigo-700">PatentPending</Link>
        <div className="flex gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign In</Link>
          <Link href="/partners/apply" className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">Apply Now</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-800 text-sm font-semibold px-4 py-2 rounded-full mb-6">
          ⚖️ Counsel Partner Program
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Are you a patent attorney?<br/>
          <span className="text-indigo-600">Grow your practice with PatentPending.</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          Join our Counsel Partner Program and get your clients organized before they walk in the door.
          Free Pro access, directory listing, and a simple referral system — no cash, no complications.
        </p>
        <Link
          href="/partners/apply"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
        >
          Apply to Join →
        </Link>
      </div>

      {/* Benefits */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: '🎓',
              title: 'Free Pro Access',
              body: 'Get a full PatentPending Pro account at no cost. Extended by 1 month for every client you refer. No cash changes hands — ever.',
            },
            {
              icon: '📋',
              title: 'Organized Clients',
              body: 'Clients arrive with specs drafted, claims outlined, and figures generated. You spend time on strategy, not data entry.',
            },
            {
              icon: '🔍',
              title: 'Directory Listing',
              body: 'Appear in our /find-counsel directory (Pro users only). Name, firm, state, specialty. Clients looking for an attorney will find you.',
            },
          ].map(b => (
            <div key={b.title} className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
              <div className="text-4xl mb-4">{b.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">{b.title}</h3>
              <p className="text-gray-600">{b.body}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="bg-white rounded-2xl border border-gray-200 p-10 mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">How the referral program works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', text: 'Apply and get approved (1-2 business days)' },
              { step: '2', text: 'Receive your unique referral code (e.g. SARAH-X7K2)' },
              { step: '3', text: 'Share your referral link with prospective clients' },
              { step: '4', text: 'Each signup extends your Pro by 1 month, automatically' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-3">
                  {s.step}
                </div>
                <p className="text-gray-600 text-sm">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            No revenue sharing. No bar rule concerns. Just free software for bringing clients to a better workflow.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/partners/apply"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-lg font-semibold px-8 py-4 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Apply to the Partner Program →
          </Link>
          <p className="text-sm text-gray-500 mt-4">Approved within 1-2 business days. Questions? <a href="mailto:support@hotdeck.com" className="text-indigo-600">support@hotdeck.com</a></p>
        </div>
      </div>
    </div>
  )
}
