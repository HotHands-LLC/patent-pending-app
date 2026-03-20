import type { PatentLifecycleState } from './patent-lifecycle'
import type { KnowledgeChunk, KnowledgeTopic } from './pattie-knowledge'
import { PATTIE_KNOWLEDGE } from './pattie-knowledge'

export interface RetrievalContext {
  lifecycleState: PatentLifecycleState
  conversationText: string  // last 2-3 user messages concatenated
  activeBlockingIds: string[]  // IDs of active blocking conditions
}

export const BLOCKING_TO_TOPIC: Record<string, KnowledgeTopic> = {
  missing_claims: 'claims',
  missing_title: 'claims',
  missing_abstract: 'claims',
  missing_figures: 'prior_art',
  pending_inventor_signatures: 'inventors',
  missing_filing_confirmation: 'provisional_filing',
  conversion_deadline_approaching: 'provisional_filing',
  conversion_deadline_passed: 'provisional_filing',
  office_action_deadline: 'office_actions',
  maintenance_fee_due: 'maintenance',
}

export function retrieveRelevantChunks(
  context: RetrievalContext,
  maxChunks: number = 5
): KnowledgeChunk[] {
  // 1. Always include urgency_boost chunks for current state (cap at 3)
  const urgencyChunks = PATTIE_KNOWLEDGE.filter(c =>
    c.urgency_boost &&
    (c.lifecycle_states.length === 0 || c.lifecycle_states.includes(context.lifecycleState))
  ).slice(0, 3)

  // 2. Score remaining chunks
  const urgencyIds = new Set(urgencyChunks.map(c => c.id))
  const conversationLower = context.conversationText.toLowerCase()

  const scored = PATTIE_KNOWLEDGE
    .filter(c => !urgencyIds.has(c.id))
    .map(c => {
      let score = 0

      // State match
      if (c.lifecycle_states.length === 0 || c.lifecycle_states.includes(context.lifecycleState)) {
        score += 3
      }

      // Keyword match
      for (const tag of c.tags) {
        const tagWords = tag.toLowerCase().split(/\s+/)
        if (tagWords.some(w => w.length > 3 && conversationLower.includes(w))) {
          score += 2
          break  // max +2 per chunk from keywords
        }
      }

      // Blocking condition topic match
      for (const blockingId of context.activeBlockingIds) {
        const topic = BLOCKING_TO_TOPIC[blockingId]
        if (topic && topic === c.topic) {
          score += 4
          break
        }
      }

      return { chunk: c, score }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks - urgencyChunks.length)
    .map(s => s.chunk)

  return [...urgencyChunks, ...scored]
}
