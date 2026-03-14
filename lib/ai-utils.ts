/**
 * lib/ai-utils.ts
 * Shared AI utility functions for PatentPending.app
 */

/**
 * Strip LLM model attribution from AI-generated content before storage.
 * All AI is presented to users as "PatentPending AI" — never expose underlying model names.
 */
export function stripLlmAttribution(content: string): string {
  return content
    // Google / Gemini
    .replace(/gemini[\s\-]*(2\.5\s*pro|2\.5\s*flash|pro|flash|[\d\.]+)?/gi, 'PatentPending AI')
    .replace(/google[\s]*ai/gi, 'PatentPending AI')
    .replace(/\bgemini\b/gi, 'PatentPending AI')
    // Anthropic / Claude
    .replace(/claude[\s\-]*(sonnet|opus|haiku|[\d\.]+)?/gi, 'PatentPending AI')
    .replace(/\banthropicai?\b/gi, 'PatentPending AI')
    .replace(/\banthropic\b/gi, 'PatentPending AI')
    // OpenAI / GPT
    .replace(/gpt[\s\-]*[\d]+/gi, 'PatentPending AI')
    .replace(/\bopenai\b/gi, 'PatentPending AI')
    // Deduplicate "PatentPending AI PatentPending AI" → "PatentPending AI"
    .replace(/(PatentPending AI\s*)+/gi, 'PatentPending AI')
    .trim()
}

/**
 * Build a research report title for patent_correspondence storage.
 */
export function researchReportTitle(feature: string, date?: Date): string {
  const d = date ?? new Date()
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const labels: Record<string, string> = {
    deep_research:     'Prior Art & Claims Analysis',
    pattie_polish:     'Pattie Polish Pass',
    patent_analysis:   'Competitive Patent Analysis',
  }
  const label = labels[feature] ?? 'Research Report'
  return `PatentPending AI — ${label} — ${dateStr}`
}
