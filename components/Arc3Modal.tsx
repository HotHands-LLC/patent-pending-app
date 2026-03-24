'use client'
import { useState } from 'react'

interface Arc3ModalProps {
  patentId: string
  patentTitle: string
  authToken: string
  onSuccess: (slug: string, dealUrl: string) => void
  onClose: () => void
}

export default function Arc3Modal({ patentId, patentTitle, authToken, onSuccess, onClose }: Arc3ModalProps) {
  const [agreed, setAgreed] = useState(false)
  const [licensingExclusive, setLicensingExclusive] = useState(false)
  const [licensingNonExclusive, setLicensingNonExclusive] = useState(true)
  const [licensingFieldOfUse, setLicensingFieldOfUse] = useState(false)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')

  async function activate() {
    if (!agreed) { setError('You must agree to the agency terms before proceeding.'); return }
    setActivating(true)
    setError('')
    try {
      // Step 1: Activate Marketplace (creates agency agreement)
      const res = await fetch(`/api/patents/${patentId}/activate-arc3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          licensing_exclusive: licensingExclusive,
          licensing_nonexclusive: licensingNonExclusive,
          licensing_field_of_use: licensingFieldOfUse,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Activation failed'); return }

      // Step 2: Generate deal page content via Gemini (non-blocking)
      fetch(`/api/patents/${patentId}/generate-deal-page`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {}) // fire and forget

      onSuccess(data.slug, data.deal_page_url)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Activate Marketplace</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate max-w-xs">{patentTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* What this does */}
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <div className="font-semibold text-indigo-900 mb-1">What the Marketplace does</div>
            <ul className="text-sm text-indigo-700 space-y-1">
              <li>✓ Creates a public deal page at patentpending.app/patents/[slug]</li>
              <li>✓ AI generates plain-English summary + market opportunity</li>
              <li>✓ Licensing inquiry form routes to you</li>
              <li>✓ HHLLC manages inquiries on your behalf</li>
            </ul>
          </div>

          {/* Licensing options */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Licensing Options Available</div>
            <div className="space-y-2">
              {[
                { key: 'nonexclusive', label: 'Non-Exclusive License', state: licensingNonExclusive, set: setLicensingNonExclusive },
                { key: 'exclusive', label: 'Exclusive License', state: licensingExclusive, set: setLicensingExclusive },
                { key: 'fieldofuse', label: 'Field-of-Use License', state: licensingFieldOfUse, set: setLicensingFieldOfUse },
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={opt.state} onChange={e => opt.set(e.target.checked)}
                    className="w-4 h-4 rounded accent-indigo-600" />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded border border-gray-300 bg-gray-100 flex items-center justify-center">
                  <span className="text-xs text-gray-400">✓</span>
                </span>
                <span className="text-sm text-gray-500">Outright Sale / Acquisition (always available)</span>
              </div>
            </div>
          </div>

          {/* Agency Agreement Terms — dynamic based on checked license types */}
          {(() => {
            const checkedTypes = [
              licensingNonExclusive && 'Non-Exclusive License',
              licensingExclusive && 'Exclusive License',
              licensingFieldOfUse && 'Field-of-Use License',
              'Outright Sale / Acquisition',  // always available
            ].filter(Boolean) as string[]
            const atLeastOne = licensingNonExclusive || licensingExclusive || licensingFieldOfUse

            return (
              <>
                <div className="border border-amber-200 rounded-xl p-4 bg-amber-50">
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Agency Agreement — v1</div>
                  <div className="text-xs text-amber-900 space-y-2 max-h-36 overflow-y-auto">
                    <p>By activating Arc 3, you authorize Hot Hands LLC (&ldquo;Agency&rdquo;) to represent your patent for licensing and sale on the PatentPending marketplace.</p>
                    <p>
                      <strong>Deal structures available:</strong>{' '}
                      Licensor makes this patent available for the following deal structures:{' '}
                      <span className="font-semibold">{checkedTypes.join(', ')}</span>.
                    </p>
                    <p>
                      <strong>Commission:</strong> Agency earns 20% commission on deals originating from the PatentPending platform only. You retain the right to pursue deals independently; commission only applies to deals where the buyer first contacted you through the deal page.
                    </p>
                    <p><strong>No upfront cost.</strong> Commission is owed only upon a signed deal.</p>
                    <p><strong>Termination:</strong> Either party may deactivate the deal page at any time with 30 days written notice. Commission is owed on deals signed prior to deactivation.</p>
                  </div>
                </div>

                {/* Agreement checkbox — disabled until at least one license type is checked */}
                <label className={`flex items-start gap-3 ${atLeastOne ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={agreed}
                    disabled={!atLeastOne}
                    onChange={e => setAgreed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-indigo-600 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700">
                    I agree to the Agency Agreement above. I understand Hot Hands LLC will receive a 20% commission on deals originating from my deal page.
                    {!atLeastOne && <span className="block text-xs text-amber-600 mt-0.5">Select at least one license type above to proceed.</span>}
                  </span>
                </label>
              </>
            )
          })()}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={activate}
            disabled={activating || !agreed}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {activating ? 'Activating...' : 'Activate Marketplace — Create Deal Page →'}
          </button>
        </div>
      </div>
    </div>
  )
}
