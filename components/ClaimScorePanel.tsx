'use client'

/**
 * ClaimScorePanel — P35 Claim Strength Scorer UI
 *
 * Shows per-claim rows with composite score progress bar + flag count.
 * Clicking expands to show breadth/specificity/vulnerability breakdown.
 * "Ask Pattie to fix this →" pre-fills Pattie with the suggestion.
 * Summary at top: average score, weakest/strongest claim.
 * "Re-analyze" button triggers fresh scoring.
 */

import React, { useState } from 'react'
import type { ClaimScore, ClaimScorerResult } from '@/lib/claim-scorer'
import { computeClaimSummary } from '@/lib/claim-scorer'

interface ClaimScorePanelProps {
  patentId: string
  authToken: string
  claimsScores: ClaimScorerResult | null
  onAskPattie: (message: string) => void
  onReanalyzed: (result: ClaimScorerResult) => void
  canWrite: boolean
}

// ── Score bar sub-component ───────────────────────────────────────────────────
function MiniScoreBar({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const pct = ((value - 1) / 4) * 100 // 1-5 → 0-100%
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right font-semibold text-gray-700 shrink-0">{value}</span>
    </div>
  )
}

// ── Composite score color ─────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 4) return 'bg-green-500'
  if (score >= 3) return 'bg-amber-400'
  if (score >= 2) return 'bg-orange-400'
  return 'bg-red-500'
}

function scoreTextColor(score: number): string {
  if (score >= 4) return 'text-green-700'
  if (score >= 3) return 'text-amber-700'
  if (score >= 2) return 'text-orange-600'
  return 'text-red-600'
}

function scoreBg(score: number): string {
  if (score >= 4) return 'bg-green-50 border-green-200'
  if (score >= 3) return 'bg-amber-50 border-amber-200'
  if (score >= 2) return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}

// ── Single claim row ──────────────────────────────────────────────────────────
function ClaimRow({
  score,
  onAskPattie,
}: {
  score: ClaimScore
  onAskPattie: (msg: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const pct = ((score.compositeScore - 1) / 4) * 100

  const pattieMessage = `I need help strengthening Claim ${score.claimNumber}. Here's the current text:\n\n${score.claimText}\n\nIssues identified:\n${score.flags.length > 0 ? score.flags.map(f => `- ${f}`).join('\n') : '(none flagged)'}\n\nSuggested fix: ${score.suggestion}\n\nPlease rewrite this claim to address these issues.`

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${scoreBg(score.compositeScore)}`}
    >
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:brightness-95 transition-all text-left"
      >
        {/* Claim number badge */}
        <span className="text-xs font-bold text-gray-500 w-12 shrink-0">
          Claim {score.claimNumber}
        </span>

        {/* Progress bar */}
        <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-0">
          <div
            className={`h-2 rounded-full transition-all ${scoreColor(score.compositeScore)}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Composite score */}
        <span className={`text-xs font-bold w-8 text-right shrink-0 ${scoreTextColor(score.compositeScore)}`}>
          {score.compositeScore.toFixed(1)}
        </span>

        {/* Flag count */}
        {score.flags.length > 0 && (
          <span className="text-xs text-red-500 font-semibold shrink-0 flex items-center gap-0.5">
            ⚑ {score.flags.length}
          </span>
        )}

        {/* Chevron */}
        <span className="text-gray-300 text-sm shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-current/10 pt-3 space-y-4">
          {/* Claim text preview */}
          <div className="text-xs font-mono text-gray-600 bg-white/70 rounded-lg p-3 leading-relaxed max-h-32 overflow-y-auto">
            {score.claimText}
          </div>

          {/* Score breakdown */}
          <div className="space-y-2">
            <MiniScoreBar
              label="Breadth"
              value={score.breadthScore}
              color="bg-blue-400"
            />
            <MiniScoreBar
              label="Specificity"
              value={score.specificityScore}
              color="bg-indigo-400"
            />
            <MiniScoreBar
              label="Vulnerability"
              value={score.vulnerabilityScore}
              color="bg-purple-400"
            />
          </div>

          {/* Score legend */}
          <p className="text-[10px] text-gray-400">
            Breadth: 5=very broad · Specificity: 5=crystal-clear · Vulnerability: 5=low prior art risk
          </p>

          {/* Flags */}
          {score.flags.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-600">⚑ Flags</p>
              {score.flags.map((flag, i) => (
                <div key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                  {flag}
                </div>
              ))}
            </div>
          )}

          {/* Suggestion */}
          {score.suggestion && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-700 mb-1">💡 Suggestion</p>
              <p className="text-xs text-amber-800 leading-relaxed">{score.suggestion}</p>
            </div>
          )}

          {/* Ask Pattie button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAskPattie(pattieMessage)
            }}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            🦞 Ask Pattie to fix this →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main ClaimScorePanel ──────────────────────────────────────────────────────
export default function ClaimScorePanel({
  patentId,
  authToken,
  claimsScores,
  onAskPattie,
  onReanalyzed,
  canWrite,
}: ClaimScorePanelProps) {
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null)

  const scores = claimsScores?.scores ?? []
  const summary = scores.length > 0 ? computeClaimSummary(scores) : null

  async function handleReanalyze() {
    setReanalyzing(true)
    setReanalyzeError(null)
    try {
      const res = await fetch(`/api/patents/${patentId}/score-claims`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setReanalyzeError(data.error ?? 'Re-analyze failed')
      } else {
        onReanalyzed(data)
      }
    } catch (err) {
      setReanalyzeError(String(err))
    } finally {
      setReanalyzing(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span>🎯</span>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Claim Strength Analysis
          </span>
          {claimsScores?.scoredAt && (
            <span className="text-[10px] text-gray-400">
              · scored {new Date(claimsScores.scoredAt).toLocaleString()}
            </span>
          )}
        </div>
        {canWrite && (
          <button
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {reanalyzing ? '⏳ Analyzing…' : '🔄 Re-analyze'}
          </button>
        )}
      </div>

      {reanalyzeError && (
        <div className="px-5 py-2 bg-red-50 text-xs text-red-700 border-b border-red-100">
          ⚠ {reanalyzeError}
        </div>
      )}

      {/* No scores yet */}
      {scores.length === 0 && !reanalyzing && (
        <div className="px-5 py-8 text-center">
          <div className="text-2xl mb-2">🎯</div>
          <p className="text-sm text-gray-500 mb-1">No claim scores yet</p>
          <p className="text-xs text-gray-400 mb-4">
            {canWrite
              ? 'Click Re-analyze to score your claims with AI.'
              : 'Scores will appear after the patent owner runs analysis.'}
          </p>
          {canWrite && (
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {reanalyzing ? '⏳ Analyzing…' : '🎯 Analyze Claim Strength'}
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {reanalyzing && (
        <div className="px-5 py-8 text-center">
          <div className="text-2xl mb-2 animate-pulse">🔬</div>
          <p className="text-sm text-gray-500 animate-pulse">Analyzing claims with Gemini…</p>
        </div>
      )}

      {/* Summary */}
      {summary && !reanalyzing && (
        <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className={`text-xl font-black ${scoreTextColor(summary.averageScore)}`}>
                {summary.averageScore.toFixed(1)}
                <span className="text-xs font-normal text-gray-400">/5</span>
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Avg Score</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-green-700">
                #{summary.strongestClaim.claimNumber}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Strongest</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-red-600">
                #{summary.weakestClaim.claimNumber}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Weakest</div>
            </div>
          </div>
          {summary.totalFlags > 0 && (
            <div className="mt-3 text-center">
              <span className="text-xs text-red-500 font-semibold">
                ⚑ {summary.totalFlags} flag{summary.totalFlags !== 1 ? 's' : ''} across {summary.claimCount} claim{summary.claimCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Per-claim rows */}
      {scores.length > 0 && !reanalyzing && (
        <div className="p-4 space-y-2">
          {scores
            .slice()
            .sort((a, b) => a.claimNumber - b.claimNumber)
            .map((score) => (
              <ClaimRow
                key={score.claimNumber}
                score={score}
                onAskPattie={onAskPattie}
              />
            ))}
        </div>
      )}
    </div>
  )
}
