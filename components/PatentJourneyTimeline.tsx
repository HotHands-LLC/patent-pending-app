'use client'

import React, { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type PatentStatus =
  | 'provisional_draft'
  | 'provisional_filed'
  | 'np_filed'
  | 'under_examination'
  | 'allowed'
  | 'granted'
  | string  // fallback for other statuses

/** Stage values from the stage-engine (lib/patent-stage.ts) */
export type PatentLifecycleStage =
  | 'idea'
  | 'claims'
  | 'spec'
  | 'figures'
  | 'provisional'
  | 'nonprovisional'
  | 'examination'
  | 'granted'
  | string

interface StageDate {
  label: string
  value: string
}

export interface PatentJourneyTimelineProps {
  /** Current patent status — drives active/completed state (legacy; used when stage not set) */
  status?: PatentStatus | null
  /** Live lifecycle stage from DB (from stage-engine). Overrides status-based derivation when set. */
  stage?: PatentLifecycleStage | null
  /** Provisional filing date */
  filingDate?: string | null
  /** np_filing_steps from patent record */
  npFilingSteps?: Record<string, boolean | string | null> | null
  /** When the provisional was filed */
  provisionalFiledAt?: string | null
  /** When NP was filed */
  npFiledAt?: string | null
  /** Marketing/demo mode: show a pre-set "completed through examination" view */
  demoMode?: boolean
}

// ── Stage definitions ────────────────────────────────────────────────────────

interface Stage {
  id: string
  number: number
  label: string
  sublabel: string
  duration: string
  icon: string
  description: string
  tip?: string
}

const STAGES: Stage[] = [
  {
    id: 'invention_disclosure',
    number: 1,
    label: 'Invention Disclosure',
    sublabel: 'Document your idea',
    duration: '1–7 days',
    icon: '💡',
    description:
      'Capture your invention in writing — what it does, how it works, and what makes it novel. This becomes the foundation of your patent application.',
    tip: 'Include drawings, diagrams, or even napkin sketches. The more detail, the better.',
  },
  {
    id: 'provisional_application',
    number: 2,
    label: 'Provisional Application',
    sublabel: 'File Patent Pending status',
    duration: '1–4 weeks',
    icon: '📋',
    description:
      'File a provisional application with the USPTO to lock in your priority date. You now have "Patent Pending" status and 12 months to file your non-provisional.',
    tip: 'Provisional applications are not examined — they just hold your priority date.',
  },
  {
    id: 'non_provisional_filing',
    number: 3,
    label: 'Non-Provisional Filing',
    sublabel: 'Full application to USPTO',
    duration: '1–3 months',
    icon: '⚖️',
    description:
      'File your complete patent application — claims, specification, drawings, and cover sheet. This is the application that will be examined by the USPTO.',
    tip: 'Must be filed within 12 months of your provisional or you lose your priority date.',
  },
  {
    id: 'uspto_examination',
    number: 4,
    label: 'USPTO Examination',
    sublabel: 'Patent office reviews your application',
    duration: '18–36 months',
    icon: '🏛️',
    description:
      'A USPTO patent examiner reviews your application and searches prior art to determine if your invention is novel and non-obvious.',
    tip: 'The average wait for first action is 16–18 months. Check USPTO PAIR for status updates.',
  },
  {
    id: 'office_action_response',
    number: 5,
    label: 'Office Action Response',
    sublabel: 'Respond to examiner objections',
    duration: '3–6 months',
    icon: '📬',
    description:
      'If the examiner raises objections or rejections, you have the opportunity to respond, amend claims, or argue for patentability. This step is conditional.',
    tip: 'Most applications receive at least one office action. This is normal — it\'s part of the process.',
  },
  {
    id: 'patent_allowance',
    number: 6,
    label: 'Patent Allowance',
    sublabel: 'USPTO approves your application',
    duration: '1–3 months',
    icon: '✅',
    description:
      'The examiner issues a Notice of Allowance — your patent has been approved. You\'ll receive a formal notice and have 3 months to pay the issue fee.',
    tip: 'You can request an extension (with fees) if you need more time to pay.',
  },
  {
    id: 'issue_fee_grant',
    number: 7,
    label: 'Issue Fee & Grant',
    sublabel: 'Pay issue fee, patent is granted',
    duration: '1–3 months',
    icon: '🎉',
    description:
      'Pay the issue fee to the USPTO and your patent is officially granted. You\'ll receive a patent number and certificate.',
    tip: 'Micro entity issue fee is currently $800. Small entity is $1,600. Large entity is $3,200.',
  },
  {
    id: 'maintenance',
    number: 8,
    label: 'Maintenance',
    sublabel: 'Pay fees to keep patent alive',
    duration: '20 years',
    icon: '🔑',
    description:
      'Utility patents require maintenance fee payments at 3.5, 7.5, and 11.5 years from the grant date. Missing a payment can invalidate your patent.',
    tip: 'Set calendar reminders well in advance — these fees cannot be overlooked.',
  },
]

// ── Stage engine stage → timeline index ──────────────────────────────────────
// Maps the DB lifecycle stage (from patent-stage.ts) to the 0-based STAGES array index

function stageEngineToTimelineIndex(stage: PatentLifecycleStage): number {
  switch (stage) {
    case 'idea':
      return 0  // Stage 1: Invention Disclosure
    case 'claims':
    case 'spec':
    case 'figures':
      return 1  // Stage 2: Provisional Application (still in pre-filing preparation)
    case 'provisional':
      return 1  // Stage 2: Provisional Application (active)
    case 'nonprovisional':
      return 2  // Stage 3: Non-Provisional Filing (filed, now pending examination)
    case 'examination':
      return 3  // Stage 4: USPTO Examination
    case 'granted':
      return 7  // Stage 8: Maintenance
    default:
      return 0
  }
}

// ── Status → stage mapping ────────────────────────────────────────────────────

function getActiveStageIndex(status?: PatentStatus | null): number {
  switch (status) {
    case 'provisional_draft':
      return 0  // Stage 1: Invention Disclosure
    case 'provisional':
    case 'provisional_filed':
      return 1  // Stage 2: Provisional Application (active)
    case 'np_filed':
    case 'non_provisional':
    case 'nonprov_filed':
      return 3  // Stage 4: USPTO Examination
    case 'under_examination':
      return 3  // Stage 4: USPTO Examination
    case 'allowed':
    case 'published':
      return 5  // Stage 6: Patent Allowance
    case 'granted':
      return 7  // Stage 8: Maintenance
    default:
      return 0
  }
}

// ── Visual states ─────────────────────────────────────────────────────────────

type StageState = 'completed' | 'active' | 'upcoming'

function getStageState(stageIndex: number, activeIndex: number): StageState {
  if (stageIndex < activeIndex) return 'completed'
  if (stageIndex === activeIndex) return 'active'
  return 'upcoming'
}

// ── Stage Node — Desktop ──────────────────────────────────────────────────────

interface StageNodeProps {
  stage: Stage
  state: StageState
  isSelected: boolean
  date?: StageDate | null
  isLast: boolean
  onClick: () => void
  index: number
}

function DesktopStageNode({ stage, state, isSelected, date, isLast, onClick, index }: StageNodeProps) {
  const colorMap = {
    completed: {
      circle: 'bg-emerald-500 border-emerald-500 text-white',
      connector: 'bg-emerald-400',
      label: 'text-emerald-800',
      sublabel: 'text-emerald-600',
    },
    active: {
      circle: 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-200 ring-offset-1',
      connector: 'bg-gray-200',
      label: 'text-[#1a1f36] font-bold',
      sublabel: 'text-indigo-600 font-semibold',
    },
    upcoming: {
      circle: 'bg-white border-gray-300 text-gray-400',
      connector: 'bg-gray-200',
      label: 'text-gray-400',
      sublabel: 'text-gray-300',
    },
  }

  const colors = colorMap[state]

  return (
    <div className="flex flex-col items-center flex-1 min-w-0 relative">
      {/* Connector line */}
      {!isLast && (
        <div className={`absolute top-5 left-1/2 w-full h-0.5 z-0 ${state === 'completed' ? 'bg-emerald-400' : 'bg-gray-200'}`}
          style={{ left: '50%' }}
        />
      )}

      {/* Circle button */}
      <button
        onClick={onClick}
        className={`relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 ${colors.circle} ${isSelected ? 'scale-110 shadow-lg' : ''}`}
        aria-label={`Stage ${stage.number}: ${stage.label}`}
        title={stage.label}
      >
        {state === 'completed' ? '✓' : state === 'active' ? (
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
        ) : stage.number}
      </button>

      {/* Label */}
      <div className="mt-2 text-center px-1">
        <p className={`text-[10px] font-semibold leading-tight ${colors.label} truncate max-w-[80px]`} title={stage.label}>
          {stage.label}
        </p>
        <p className={`text-[9px] mt-0.5 leading-tight ${colors.sublabel} truncate max-w-[80px]`} title={stage.sublabel}>
          {stage.sublabel}
        </p>
        {date && (
          <p className="text-[9px] text-gray-400 mt-0.5 truncate max-w-[80px]">{date.label}</p>
        )}
      </div>
    </div>
  )
}

// ── Stage Row — Mobile ────────────────────────────────────────────────────────

function MobileStageRow({ stage, state, isSelected, date, isLast, onClick }: StageNodeProps) {
  const stateStyles = {
    completed: 'border-emerald-400',
    active: 'border-indigo-500',
    upcoming: 'border-gray-200',
  }
  const circleStyles = {
    completed: 'bg-emerald-500 text-white border-emerald-500',
    active: 'bg-indigo-600 text-white border-indigo-600 ring-4 ring-indigo-100',
    upcoming: 'bg-white text-gray-400 border-gray-300',
  }

  return (
    <div className="relative">
      {/* Connector */}
      {!isLast && (
        <div className={`absolute left-5 top-12 bottom-0 w-0.5 ${state === 'completed' ? 'bg-emerald-400' : 'bg-gray-200'}`} />
      )}

      <button
        onClick={onClick}
        className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${
          isSelected
            ? 'border-indigo-300 bg-indigo-50 shadow-sm'
            : `${stateStyles[state]} bg-white hover:bg-gray-50`
        }`}
      >
        {/* Circle */}
        <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${circleStyles[state]}`}>
          {state === 'completed' ? '✓' : state === 'active' ? '●' : stage.number}
        </div>
        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${state === 'upcoming' ? 'text-gray-400' : 'text-[#1a1f36]'}`}>
              {stage.label}
            </span>
            {state === 'active' && (
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">
                Active
              </span>
            )}
            {state === 'completed' && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                Done
              </span>
            )}
          </div>
          <p className={`text-xs mt-0.5 ${state === 'upcoming' ? 'text-gray-300' : 'text-gray-500'}`}>
            {stage.sublabel}
          </p>
          {date && <p className="text-xs text-gray-400 mt-0.5">{date.label}: {date.value}</p>}
          <p className={`text-xs mt-0.5 ${state === 'upcoming' ? 'text-gray-300' : 'text-gray-400'}`}>
            Est. {stage.duration}
          </p>
        </div>
        <span className={`text-gray-300 text-lg shrink-0 mt-0.5 transition-transform ${isSelected ? 'rotate-180 text-indigo-400' : ''}`}>
          ›
        </span>
      </button>

      {/* Expanded tooltip */}
      {isSelected && (
        <div className="mt-1 ml-13 pl-[52px] pr-3 pb-3">
          <div className="bg-white rounded-xl border border-indigo-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{stage.icon}</span>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stage {stage.number}</span>
              <span className="text-xs text-gray-400 ml-auto">~{stage.duration}</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{stage.description}</p>
            {stage.tip && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                <span className="text-sm shrink-0">💡</span>
                <p className="text-xs text-amber-800 leading-relaxed">{stage.tip}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tooltip panel for desktop ─────────────────────────────────────────────────

function TooltipPanel({ stage, state, date }: { stage: Stage; state: StageState; date?: StageDate | null }) {
  const stateColor = {
    completed: 'text-emerald-700',
    active: 'text-indigo-700',
    upcoming: 'text-gray-400',
  }

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm transition-all">
      <div className="flex items-start gap-4">
        <div className="text-3xl shrink-0">{stage.icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="font-bold text-[#1a1f36]">{stage.label}</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              state === 'completed' ? 'bg-emerald-100 text-emerald-700' :
              state === 'active' ? 'bg-indigo-100 text-indigo-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {state === 'completed' ? 'Completed' : state === 'active' ? '← You are here' : 'Upcoming'}
            </span>
            <span className={`text-xs ${stateColor[state]} ml-auto`}>Est. {stage.duration}</span>
          </div>
          <p className="text-sm text-gray-500 mb-3">{stage.sublabel}</p>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">{stage.description}</p>
          {date && (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="font-semibold text-gray-600">{date.label}:</span>
              <span className="text-gray-700">{new Date(date.value + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
          {stage.tip && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <span className="text-sm shrink-0">💡</span>
              <p className="text-xs text-amber-800 leading-relaxed">{stage.tip}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PatentJourneyTimeline({
  status,
  stage,
  filingDate,
  npFilingSteps,
  provisionalFiledAt,
  npFiledAt,
  demoMode = false,
}: PatentJourneyTimelineProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Demo mode: show completed through examination
  // Priority: stage (from DB stage-engine) > status (legacy) > default
  const activeIndex = demoMode
    ? 3  // Stage 4: USPTO Examination
    : stage
      ? stageEngineToTimelineIndex(stage as PatentLifecycleStage)
      : getActiveStageIndex(status ?? 'provisional_draft')

  // Build date map for stages that have known dates
  const stageDates: Record<number, StageDate> = {}
  if (filingDate) {
    stageDates[0] = { label: 'Documented', value: filingDate }
    stageDates[1] = { label: 'Filed', value: filingDate }
  }
  if (provisionalFiledAt) {
    stageDates[1] = { label: 'Filed', value: provisionalFiledAt.split('T')[0] }
  }
  if (npFiledAt) {
    stageDates[2] = { label: 'Filed', value: npFiledAt.split('T')[0] }
  }

  const handleToggle = (idx: number) => {
    setSelectedIndex(prev => prev === idx ? null : idx)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[#1a1f36] text-sm">Patent Journey</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {demoMode
              ? 'The typical patent process — from idea to grant'
              : `Stage ${activeIndex + 1} of ${STAGES.length} · ${STAGES[activeIndex].label}`}
          </p>
        </div>
        <span className="text-xs text-gray-400 font-medium">
          {STAGES.filter((_, i) => i < activeIndex).length} of {STAGES.length} complete
        </span>
      </div>

      {/* Desktop: horizontal timeline */}
      <div className="hidden md:block px-6 pt-6 pb-4">
        <div className="flex items-start">
          {STAGES.map((stage, idx) => (
            <DesktopStageNode
              key={stage.id}
              stage={stage}
              state={getStageState(idx, activeIndex)}
              isSelected={selectedIndex === idx}
              date={stageDates[idx] ?? null}
              isLast={idx === STAGES.length - 1}
              onClick={() => handleToggle(idx)}
              index={idx}
            />
          ))}
        </div>

        {/* Desktop tooltip panel */}
        {selectedIndex !== null && (
          <TooltipPanel
            stage={STAGES[selectedIndex]}
            state={getStageState(selectedIndex, activeIndex)}
            date={stageDates[selectedIndex] ?? null}
          />
        )}

        <p className="text-[10px] text-gray-300 mt-4 text-center">Click any stage for details</p>
      </div>

      {/* Mobile: vertical list */}
      <div className="md:hidden p-4 space-y-2">
        {STAGES.map((stage, idx) => (
          <MobileStageRow
            key={stage.id}
            stage={stage}
            state={getStageState(idx, activeIndex)}
            isSelected={selectedIndex === idx}
            date={stageDates[idx] ?? null}
            isLast={idx === STAGES.length - 1}
            onClick={() => handleToggle(idx)}
            index={idx}
          />
        ))}
      </div>
    </div>
  )
}
