'use client'

import { useState } from 'react'
import Link from 'next/link'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

export default function PartnerApplyPage() {
  const [form, setForm] = useState({ full_name: '', firm_name: '', bar_number: '', state: '', specialty: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ referral_code: string } | null>(null)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Submission failed'); return }
      setDone({ referral_code: d.referral_code })
    } catch { setError('Network error — please try again') }
    finally { setLoading(false) }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-10 max-w-lg w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Application Submitted!</h2>
          <p className="text-gray-600 mb-6">We&apos;ll review and be in touch within 1-2 business days.</p>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6">
            <p className="text-sm text-indigo-700 mb-2 font-semibold">Your referral code (reserved for you):</p>
            <p className="text-3xl font-bold text-indigo-900 tracking-wider font-mono">{done.referral_code}</p>
            <p className="text-xs text-indigo-600 mt-2">Active once your application is approved.</p>
          </div>
          <Link href="/" className="text-indigo-600 hover:text-indigo-800 text-sm">← Back to PatentPending</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/partners" className="text-indigo-600 hover:text-indigo-800 text-sm">← Partner Program</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-2">Apply to the Counsel Partner Program</h1>
          <p className="text-gray-600">Takes about 2 minutes. We review within 1-2 business days.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
                <input required value={form.full_name} onChange={set('full_name')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Sarah H. Simpson" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Firm Name *</label>
                <input required value={form.firm_name} onChange={set('firm_name')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Simpson Trademark Law PLLC" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bar Number *</label>
                <input required value={form.bar_number} onChange={set('bar_number')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="TX12345678" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">State *</label>
                <select required value={form.state} onChange={set('state')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="">Select state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Specialty / Practice Areas</label>
              <input value={form.specialty} onChange={set('specialty')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Utility patents, electrical engineering, mechanical" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address *</label>
              <input required type="email" value={form.email} onChange={set('email')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="sarah@simpsontrademarklaw.com" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? 'Submitting...' : 'Submit Application →'}
            </button>

            <p className="text-xs text-gray-500 text-center">
              No cash payments. No revenue share. Just free Pro access extended by referrals.
              <br />Questions? <a href="mailto:support@hotdeck.com" className="text-indigo-600">support@hotdeck.com</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
