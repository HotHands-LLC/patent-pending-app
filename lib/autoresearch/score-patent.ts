/**
 * score-patent.ts — PatentClaw Autoresearch Scoring Engine
 * Scores a raw patent record 0–100 for marketplace potential.
 * Flags Desjardins revival candidates (AI/ML abandoned pre-Nov 2025 for §101).
 */

export interface PatentData {
  title: string
  abstract: string
  claimCount: number
  filingDate: string
  abandonmentDate?: string
  abandonmentReason?: string
  cpcCodes: string[]
  assignee?: string
  hasDrawings?: boolean
}

export interface ScoreResult {
  score: number
  desjardinsFlag: boolean
  breakdown: {
    hasTitle: number
    hasAbstract: number
    claimCount: number
    hasDrawings: number
    recency: number
    aiRelevance: number
    desjardinsBonus: number
  }
}

// CPC code prefixes associated with AI/ML technology
const AI_CPC_PREFIXES = ['G06N', 'G06F40', 'G16H', 'G06V', 'G10L']

const AI_ABSTRACT_PATTERN =
  /machine learning|neural network|artificial intelligence|deep learning|NLP|natural language processing|computer vision|large language model|transformer model|generative ai/i

const DESJARDINS_DATE = new Date('2025-11-04') // Ex parte Desjardins decision date

export function scorePatent(data: PatentData): ScoreResult {
  const breakdown = {
    hasTitle:        data.title?.trim() ? 10 : 0,
    hasAbstract:     data.abstract && data.abstract.length > 100 ? 15 : 0,
    claimCount:      Math.min((data.claimCount || 0) * 3, 20),
    hasDrawings:     data.hasDrawings ? 10 : 0,
    recency:         scoreRecency(data.filingDate),
    aiRelevance:     scoreAIRelevance(data.cpcCodes, data.abstract),
    desjardinsBonus: 0,
  }

  // Desjardins flag: AI/ML patent abandoned for §101 before Nov 4 2025
  const isAIML = isAIPatent(data.cpcCodes, data.abstract)
  const abandonedPreShift = data.abandonmentDate
    ? new Date(data.abandonmentDate) < DESJARDINS_DATE
    : false
  const is101Abandonment =
    /(§\s*101|section\s*101|subject matter|101\s*rejection|abstract\s*idea)/i.test(
      data.abandonmentReason ?? ''
    )

  const desjardinsFlag = isAIML && abandonedPreShift && is101Abandonment

  if (desjardinsFlag) {
    breakdown.desjardinsBonus = 15 // significant uplift — potentially revivable
  }

  const score = Math.min(
    Object.values(breakdown).reduce((a, b) => a + b, 0),
    100
  )

  return { score, desjardinsFlag, breakdown }
}

function scoreRecency(filingDate: string): number {
  if (!filingDate) return 0
  const years =
    (Date.now() - new Date(filingDate).getTime()) / (1000 * 60 * 60 * 24 * 365)
  if (years < 3)  return 15
  if (years < 6)  return 10
  if (years < 10) return 5
  return 0
}

function scoreAIRelevance(cpcCodes: string[], abstract: string): number {
  const codeMatch = (cpcCodes ?? []).some(c =>
    AI_CPC_PREFIXES.some(ai => c.startsWith(ai))
  )
  const abstractMatch = AI_ABSTRACT_PATTERN.test(abstract ?? '')
  if (codeMatch && abstractMatch) return 15
  if (codeMatch || abstractMatch) return 8
  return 0
}

function isAIPatent(cpcCodes: string[], abstract: string): boolean {
  const codeMatch = (cpcCodes ?? []).some(c =>
    AI_CPC_PREFIXES.some(ai => c.startsWith(ai))
  )
  const abstractMatch = AI_ABSTRACT_PATTERN.test(abstract ?? '')
  return codeMatch || abstractMatch
}
