'use client'
import { useState } from 'react'
import { Patent } from '@/lib/supabase'

type Scenario = 'provisional_filing' | 'assignment' | 'non_provisional_prep'

interface DownloadPackageModalProps {
  patent: Patent
  authToken: string
  onClose: () => void
}

interface DocCheck {
  label: string
  present: boolean
  required: boolean
  note?: string
}

interface ScenarioCard {
  id: Scenario
  icon: string
  title: string
  subtitle: string
  docs: DocCheck[]
}

export default function DownloadPackageModal({ patent, authToken, onClose }: DownloadPackageModalProps) {
  const [selected, setSelected] = useState<Scenario | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const hasSpec    = !!(patent.spec_draft)
  const hasClaims  = !!(patent.claims_draft)
  const hasFigures = !!(patent.figures_uploaded)
  const hasCoverSheet = !!(patent.cover_sheet_acknowledged || patent.spec_uploaded)

  const scenarios: ScenarioCard[] = [
    {
      id: 'provisional_filing',
      icon: '📄',
      title: 'Provisional Filing',
      subtitle: 'Everything to file a provisional application at USPTO Patent Center',
      docs: [
        { label: 'Cover Sheet (ADS HTML)', present: true, required: true, note: 'Open in browser → Print → Save as PDF' },
        { label: 'Specification (.txt)', present: hasSpec, required: true },
        { label: 'Claims (.txt)', present: hasClaims, required: true },
        { label: 'Figures', present: hasFigures, required: false, note: 'Optional for provisional' },
        ...(patent.abstract_draft ? [{ label: 'Abstract (.txt)', present: true, required: false }] : []),
      ],
    },
    {
      id: 'assignment',
      icon: '📝',
      title: 'Assignment',
      subtitle: 'Templates for assignment agreement and inventor declaration',
      docs: [
        { label: 'Assignment Agreement (TEMPLATE)', present: true, required: true, note: 'Fill in [BRACKETED] fields + sign' },
        { label: 'Inventor Declaration (TEMPLATE)', present: true, required: true, note: '37 CFR 1.63 — inventor must sign' },
      ],
    },
    {
      id: 'non_provisional_prep',
      icon: '🔬',
      title: 'Non-Provisional Prep',
      subtitle: 'Full spec package + cover sheet for non-provisional filing',
      docs: [
        { label: 'Cover Sheet (ADS HTML)', present: true, required: true, note: 'Reference your provisional app number' },
        { label: 'Specification (.txt)', present: hasSpec, required: true },
        { label: 'Claims (.txt)', present: hasClaims, required: true },
        { label: 'Figures', present: hasFigures, required: false, note: 'Must be 300 DPI line art for USPTO' },
        ...(patent.abstract_draft ? [{ label: 'Abstract (.txt)', present: true, required: false }] : []),
      ],
    },
  ]

  function isScenarioReady(card: ScenarioCard): boolean {
    return card.docs.every(d => !d.required || d.present)
  }

  async function handleDownload() {
    if (!selected) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/patents/${patent.id}/download-package`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ scenario: selected }),
      })
      if (!res.ok) {
        const j = await res.json()
        setError(j.error || 'Download failed — please try again.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      a.download = match ? match[1] : `patent-package-${selected}.zip`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const selectedCard = scenarios.find(s => s.id === selected)
  const canDownload = selected !== null && (selectedCard ? isScenarioReady(selectedCard) : false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📦 Download Filing Package</h2>
            <p className="text-xs text-gray-500 mt-0.5">{patent.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scenario cards */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 mb-5">
            Select a filing scenario. Your ZIP will contain exactly the right documents for that scenario.
          </p>

          {scenarios.map(card => {
            const ready = isScenarioReady(card)
            const isSelected = selected === card.id
            const missingRequired = card.docs.filter(d => d.required && !d.present)

            return (
              <button
                key={card.id}
                onClick={() => ready && setSelected(isSelected ? null : card.id)}
                disabled={!ready}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                  !ready
                    ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                    : isSelected
                      ? 'border-[#1a1f36] bg-[#1a1f36]/5 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer'
                }`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl flex-shrink-0">{card.icon}</span>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{card.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{card.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {!ready ? (
                      <span className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-full px-2 py-0.5 font-medium">
                        Incomplete
                      </span>
                    ) : isSelected ? (
                      <span className="text-xs bg-[#1a1f36] text-white rounded-full px-2 py-0.5 font-medium">
                        Selected ✓
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Click to select</span>
                    )}
                  </div>
                </div>

                {/* Missing docs warning */}
                {!ready && missingRequired.length > 0 && (
                  <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    ⚠️ Missing required: {missingRequired.map(d => d.label).join(', ')} — complete these steps first.
                  </div>
                )}

                {/* Document checklist */}
                <div className="mt-3 space-y-1.5">
                  {card.docs.map((doc, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`flex-shrink-0 mt-0.5 ${doc.present ? 'text-green-600' : doc.required ? 'text-red-500' : 'text-yellow-500'}`}>
                        {doc.present ? '✅' : doc.required ? '❌' : '⚠️'}
                      </span>
                      <span className={`font-medium ${doc.present ? 'text-gray-700' : doc.required ? 'text-red-700' : 'text-yellow-700'}`}>
                        {doc.label}
                      </span>
                      {doc.note && (
                        <span className="text-gray-400 italic ml-1">{doc.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={!canDownload || loading}
              className="flex-1 py-2.5 bg-[#1a1f36] text-white rounded-xl text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span> Building ZIP…
                </span>
              ) : selected ? (
                '⬇ Download ZIP'
              ) : (
                'Select a scenario above'
              )}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center mt-3">
            PatentPending.app is not a law firm. Review all documents before filing.
          </p>
        </div>
      </div>
    </div>
  )
}
