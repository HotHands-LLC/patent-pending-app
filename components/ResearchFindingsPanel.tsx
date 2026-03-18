'use client'

/**
 * ResearchFindingsPanel.tsx
 * Renders classified finding cards (A/B/C/D) from a Deep Research result.
 * Filing Risk (Class A) cards always sort to top.
 * Replaces the raw <pre> blob in the deep research review banner.
 */

import { parseFindingsFromOutput, CLASS_META, type ParsedFinding } from '@/lib/pattie-sop'

interface ResearchFindingsPanelProps {
  /** The full staged research output (analysis + ---IMPROVED CLAIMS--- section) */
  stagedContent: string
}

function FindingCard({ finding }: { finding: ParsedFinding }) {
  const meta = CLASS_META[finding.class]
  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} p-3`}>
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 flex-shrink-0">{meta.emoji}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>
              {meta.label}
            </span>
            {finding.affected && finding.affected !== '—' && (
              <span className="text-xs text-gray-500 font-mono bg-white/60 px-1.5 py-0.5 rounded border border-gray-200">
                {finding.affected}
              </span>
            )}
          </div>
          <p className={`text-xs mt-1 ${meta.color} leading-relaxed`}>{finding.description}</p>
          {finding.suggestedFix && finding.suggestedFix !== '—' && (
            <p className="text-xs mt-1.5 text-gray-600 italic">
              <span className="not-italic font-medium text-gray-700">Fix: </span>
              {finding.suggestedFix}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResearchFindingsPanel({ stagedContent }: ResearchFindingsPanelProps) {
  const findings = parseFindingsFromOutput(stagedContent)

  const classAFindings = findings.filter(f => f.class === 'A')
  const otherFindings  = findings.filter(f => f.class !== 'A')

  // Extract prose analysis (everything before ---IMPROVED CLAIMS--- and strip findings block)
  const delimIdx    = stagedContent.indexOf('---IMPROVED CLAIMS---')
  const analysisRaw = delimIdx >= 0 ? stagedContent.slice(0, delimIdx) : stagedContent
  const analysisProse = analysisRaw
    .replace(/---FINDINGS---[\s\S]*?---END-FINDINGS---\n*/g, '')
    .trim()

  if (findings.length === 0) {
    // No machine-readable findings block — fall back to truncated prose preview
    return (
      <details className="mt-3">
        <summary className="text-xs text-amber-700 cursor-pointer hover:text-amber-900 font-medium">
          Preview analysis ▾
        </summary>
        <pre className="mt-2 text-xs text-gray-700 bg-white border border-amber-100 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap font-mono leading-relaxed">
          {stagedContent.slice(0, 2000)}
          {stagedContent.length > 2000 ? '…' : ''}
        </pre>
      </details>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Class A: Filing Risks — always shown expanded, no toggle */}
      {classAFindings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">
            🔴 Filing Risks — fix before filing
          </p>
          {classAFindings.map((f, i) => (
            <FindingCard key={`a-${i}`} finding={f} />
          ))}
        </div>
      )}

      {classAFindings.length === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-xs text-green-800 font-medium">✅ No Class A filing risks identified</p>
        </div>
      )}

      {/* B / C / D findings — collapsible */}
      {otherFindings.length > 0 && (
        <details>
          <summary className="text-xs text-amber-700 cursor-pointer hover:text-amber-900 font-medium select-none">
            {otherFindings.length} additional finding{otherFindings.length !== 1 ? 's' : ''} (quality, gaps, opportunities) ▾
          </summary>
          <div className="mt-2 space-y-2">
            {otherFindings.map((f, i) => (
              <FindingCard key={`other-${i}`} finding={f} />
            ))}
          </div>
        </details>
      )}

      {/* Full analysis prose — collapsible */}
      {analysisProse && (
        <details>
          <summary className="text-xs text-amber-700 cursor-pointer hover:text-amber-900 font-medium select-none">
            Full analysis ▾
          </summary>
          <pre className="mt-2 text-xs text-gray-700 bg-white border border-amber-100 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap font-mono leading-relaxed">
            {analysisProse}
          </pre>
        </details>
      )}
    </div>
  )
}
