'use client'
import type { Patent } from '@/lib/supabase'

// ── Step definitions ───────────────────────────────────────────────────────────
export const FILING_STEPS = [
  { n: 1, label: 'Intake',              shortLabel: 'Intake' },
  { n: 2, label: 'Payment',             shortLabel: 'Payment' },
  { n: 3, label: 'Claims Generated',    shortLabel: 'Claims' },
  { n: 4, label: 'Claims Approved',     shortLabel: 'Approved' },
  { n: 5, label: 'Specification',       shortLabel: 'Spec' },
  { n: 6, label: 'Drawings / Figures',  shortLabel: 'Drawings' },
  { n: 7, label: 'Cover Sheet',         shortLabel: 'Cover' },
  { n: 8, label: 'Filed with USPTO',    shortLabel: 'Filed' },
  { n: 9, label: 'Patent Pending ™',    shortLabel: 'Pending' },
]

// ── Derive step completion from patent record ──────────────────────────────────
export function computeStepStatus(patent: Patent): boolean[] {
  const hasClaimsDraft = !!patent.claims_draft
  return [
    // 1 Intake — has session, or payment, or claims draft (seed patents)
    !!(patent.intake_session_id || patent.payment_confirmed_at || hasClaimsDraft),
    // 2 Payment — payment confirmed, or has claims draft
    !!(patent.payment_confirmed_at || hasClaimsDraft),
    // 3 Claims Generated
    !!(patent.claims_status === 'complete' || hasClaimsDraft),
    // 4 Claims Approved
    !!(patent.filing_status === 'approved' || patent.filing_status === 'filed'),
    // 5 Specification Uploaded
    !!patent.spec_uploaded,
    // 6 Drawings Uploaded
    !!patent.figures_uploaded,
    // 7 Cover Sheet Acknowledged
    !!patent.cover_sheet_acknowledged,
    // 8 Filed
    !!(patent.filing_status === 'filed' || patent.status === 'non_provisional'),
    // 9 Patent Pending
    patent.status === 'non_provisional',
  ]
}

// Returns the 1-indexed current step (first incomplete step, or 9 if all done)
export function currentStep(statuses: boolean[]): number {
  const idx = statuses.findIndex(s => !s)
  return idx === -1 ? 9 : idx + 1
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface FilingProgressTrackerProps {
  patent: Patent
  compact?: boolean  // compact = horizontal pill strip for sidebar/header
  patentId?: string  // kept for API compat, no longer drives navigation on bubbles
}

// ── Compact version — horizontal strip used in header ─────────────────────────
function CompactTracker({ statuses, current }: { statuses: boolean[]; current: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {statuses.map((done, i) => (
        <div
          key={i}
          title={`Step ${i + 1}: ${FILING_STEPS[i].shortLabel}`}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 < current ? 'w-5 bg-green-500' :
            i + 1 === current ? 'w-5 bg-amber-400' :
            'w-3 bg-gray-200'
          }`}
        />
      ))}
      <span className="ml-2 text-xs font-semibold text-gray-500">
        Step {current}/9
      </span>
    </div>
  )
}

// ── Full tracker ───────────────────────────────────────────────────────────────
// Step tiles are status indicators only. Actions live in the cards below the tracker.
export default function FilingProgressTracker({ patent, compact = false }: FilingProgressTrackerProps) {
  const statuses = computeStepStatus(patent)
  const cur = currentStep(statuses)

  if (compact) return <CompactTracker statuses={statuses} current={cur} />

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Filing Journey
        </span>
        <span className="text-xs text-gray-400">
          {statuses.filter(Boolean).length} of 9 complete
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {/* 3×3 grid on sm+, 1-col on xs */}
        {/* Step tiles are navigation indicators only — action lives in the cards below */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {FILING_STEPS.map((step, i) => {
            const done = statuses[i]
            const active = i + 1 === cur && !done
            const locked = !done && i + 1 > cur

            const tileClass = `flex items-start gap-3 p-3 rounded-lg border ${
              done   ? 'border-green-100 bg-green-50' :
              active ? 'border-amber-200 bg-amber-50' :
                       'border-gray-100 bg-gray-50'
            }`

            return (
              <div key={step.n} className={tileClass}>
                {/* Circle */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  done   ? 'bg-green-500 text-white' :
                  active ? 'bg-amber-400 text-white' :
                           'bg-gray-200 text-gray-400'
                }`}>
                  {done ? '✓' : step.n}
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className={`text-xs font-semibold leading-tight ${
                    done   ? 'text-green-800' :
                    active ? 'text-amber-800' :
                             'text-gray-400'
                  }`}>
                    {step.label}
                  </div>
                  {active && (
                    <div className="text-xs text-amber-600 mt-0.5 font-medium">← Current step</div>
                  )}
                  {locked && (
                    <div className="text-xs text-gray-300 mt-0.5">Locked</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
