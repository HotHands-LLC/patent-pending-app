/**
 * pattie-desjardins.ts
 * Desjardins awareness for Pattie — AI/ML patent detection and system prompt injection.
 *
 * Ex Parte Desjardins (Nov 2025, precedential): AI patents are §101-eligible when they
 * articulate a concrete technological improvement — not just an abstract idea or algorithm.
 *
 * When a patent is detected as AI/ML-related, DESJARDINS_BLOCK is appended to Pattie's
 * system prompt to guide spec and claims drafting toward Desjardins-compliant language.
 */

export const AI_ML_TAGS = [
  'ai', 'ml', 'machine learning', 'artificial intelligence',
  'neural network', 'deep learning', 'computer vision',
  'nlp', 'natural language', 'ai/ml invention', 'software',
  'algorithm', 'llm', 'generative', 'predictive model',
  'classification', 'inference', 'training data', 'model',
]

export interface PatentForAICheck {
  tags?: string[] | null
  title?: string | null
  abstract_draft?: string | null
  description?: string | null
  claims_draft?: string | null
}

export function isAIMLPatent(patent: PatentForAICheck): boolean {
  const tagMatch = (patent.tags ?? []).some(tag =>
    AI_ML_TAGS.some(ai => tag.toLowerCase().includes(ai))
  )
  const titleMatch = AI_ML_TAGS.some(ai =>
    (patent.title ?? '').toLowerCase().includes(ai)
  )
  const abstractMatch = AI_ML_TAGS.some(ai =>
    (patent.abstract_draft ?? '').toLowerCase().includes(ai)
  )
  const descMatch = AI_ML_TAGS.some(ai =>
    (patent.description ?? '').toLowerCase().includes(ai)
  )
  const claimsMatch = AI_ML_TAGS.some(ai =>
    (patent.claims_draft ?? '').toLowerCase().includes(ai)
  )
  return tagMatch || titleMatch || abstractMatch || descMatch || claimsMatch
}

export const DESJARDINS_BLOCK = `
⚡ DESJARDINS MODE ACTIVE — AI/ML PATENT DETECTED

This patent involves AI, machine learning, or software. Under USPTO precedent (Ex Parte Desjardins, Nov 2025, precedential), AI patents are eligible under §101 when they articulate a concrete technological improvement — not just an abstract idea or algorithm.

Your guidance must actively help the inventor satisfy this standard.

SPEC GUIDANCE (surface proactively when drafting or reviewing):
• Always ask: "What specific technical problem does this AI system solve?"
• Push the inventor to describe HOW the system improves performance — not just WHAT it does
• Key phrases that satisfy Desjardins: "reduces system complexity," "improves model performance by [measurable metric]," "architectural change to information flow," "measurable accuracy or latency gains," "prevents catastrophic forgetting," "reduces false positive rate," "improves throughput without additional hardware"
• Avoid: claiming only the mathematical/statistical concept without tying it to a specific technical architecture or hardware interaction
• The spec should describe the specific technical context in which the AI operates — not just what the model predicts

CLAIMS GUIDANCE:
• Flag any claim that reads as a pure mathematical concept (e.g., "a method of computing X using a neural network") — suggest grounding in technical architecture
• Recommend including at least one claim element that describes the technical system the AI improves (e.g., "a network packet classifier that reduces CPU overhead by X%," "a sensor array wherein the ML model reduces false alarms")
• Desjardins-safe claim pattern: [technical system] + [AI method applied to system] + [specific technical improvement] = eligible
• At-risk claim pattern: [generic computer] + [abstract algorithm] = risky under Alice/Mayo

INTERVIEW ENHANCEMENT:
• If the user hasn't addressed the technological improvement angle, ask: "Does your invention improve how a machine operates, processes data, or reduces computational complexity — and can you quantify that improvement?"
• Answers should feed into spec language, not just marketing copy

When you surface Desjardins guidance, be conversational — not clinical. One key insight at a time unless the user asks for a full review.`

/**
 * Returns the Desjardins block if patent is AI/ML-related, else empty string.
 * Safe to append to any Pattie system prompt.
 */
export function getDesjardinsSupplement(patent: PatentForAICheck): string {
  return isAIMLPatent(patent) ? DESJARDINS_BLOCK : ''
}
