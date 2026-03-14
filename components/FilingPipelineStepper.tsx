'use client'
/**
 * FilingPipelineStepper — horizontal phase progress bar for the patent detail page
 * Shows current phase, days to deadline, next action, and "What does this mean?" Pattie link.
 */

import { FILING_PHASES, PHASE_NEXT_ACTION, getPhaseStep } from '@/lib/filing-pipeline'

interface FilingPipelineStepperProps {
  filingStatus:       string | null
  nonprovDeadlineAt?: string | null
  provisionalFiledAt?: string | null
  onOpenPattie?:      (seedMessage?: string) => void
}

function getDaysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

export default function FilingPipelineStepper({
  filingStatus,
  nonprovDeadlineAt,
  provisionalFiledAt,
  onOpenPattie,
}: FilingPipelineStepperProps) {
  const currentStep = getPhaseStep(filingStatus)
  const currentPhase = FILING_PHASES.find(p => p.key === filingStatus) ?? FILING_PHASES[0]
  const nextAction = PHASE_NEXT_ACTION[filingStatus ?? 'draft'] ?? PHASE_NEXT_ACTION.draft

  // Deadline: show non-prov deadline when in prep, provisional deadline when earlier
  const deadlineDate = nonprovDeadlineAt ?? null
  const days = getDaysUntil(deadlineDate)

  const deadlineColor =
    days === null ? 'text-gray-400' :
    days <= 30    ? 'text-red-500 font-bold' :
    days <= 90    ? 'text-amber-500 font-semibold' :
    'text-emerald-600'

  const isAbandoned = filingStatus === 'abandoned'
  const isGranted   = filingStatus === 'granted'

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-6 space-y-4">
      {/* Step labels + bar */}
      <div className="flex items-start gap-0">
        {FILING_PHASES.map((phase, idx) => {
          const done   = phase.step < currentStep
          const active = phase.step === currentStep
          const ahead  = phase.step > currentStep

          return (
            <div key={phase.key} className="flex items-center flex-1 min-w-0">
              {/* Node + label */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  title={phase.label}
                  className={[
                    'flex items-center justify-center rounded-full text-[10px] font-bold w-7 h-7 transition-all',
                    done   ? 'bg-indigo-600 text-white' :
                    active ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                             'bg-gray-100 text-gray-400 border border-gray-200',
                  ].join(' ')}
                >
                  {done ? '✓' : phase.step}
                </div>
                <span className={[
                  'mt-1 text-[9px] font-medium uppercase tracking-wide text-center w-14 leading-tight',
                  active ? 'text-indigo-600' : done ? 'text-gray-500' : 'text-gray-300',
                ].join(' ')}>
                  {phase.short}
                </span>
              </div>
              {/* Connector */}
              {idx < FILING_PHASES.length - 1 && (
                <div className={[
                  'flex-1 h-0.5 mx-1 mb-4 transition-all',
                  done ? 'bg-indigo-600' : 'bg-gray-200',
                ].join(' ')} />
              )}
            </div>
          )
        })}
      </div>

      {/* Current phase detail */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pt-1 border-t border-gray-100">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
              {isGranted ? '🎉 Patent Granted' : isAbandoned ? '⛔ Abandoned' : `Phase ${currentStep}: ${currentPhase.label}`}
            </span>
            {days !== null && !isGranted && !isAbandoned && (
              <span className={`text-xs ${deadlineColor}`}>
                {days <= 0 ? '⚠️ OVERDUE' : `${days}d to deadline`}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            <span className="font-medium text-gray-700">Next: </span>
            {nextAction}
          </p>
        </div>

        {onOpenPattie && (
          <button
            onClick={() => onOpenPattie(`Explain what "${currentPhase.label}" means and what I need to do next for my patent.`)}
            className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 hover:underline transition-colors"
          >
            <span>💬</span>
            <span>What does this mean?</span>
          </button>
        )}
      </div>

      {/* Deadline bar (when approaching) */}
      {days !== null && days <= 90 && !isGranted && !isAbandoned && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="text-red-500">⏰</span>
          <p className={`text-xs ${days <= 30 ? 'text-red-700 font-semibold' : 'text-amber-700'}`}>
            {days <= 0
              ? 'Deadline has passed — act immediately'
              : `${days} day${days === 1 ? '' : 's'} until ${filingStatus === 'nonprovisional_prep' ? 'non-provisional' : 'filing'} deadline`}
          </p>
        </div>
      )}
    </div>
  )
}
