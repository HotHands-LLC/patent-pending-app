/**
 * lib/llm-costs.ts — Model cost constants for spend tracking
 * Cost per 1K tokens (USD) — update when pricing changes
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':        { input: 0.003,   output: 0.015 },
  'claude-haiku-4-5':         { input: 0.00025, output: 0.00125 },
  'gemini-2.5-pro':           { input: 0.00125, output: 0.005 },
  'gemini-2.5-flash':         { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash':         { input: 0.0001,  output: 0.0004 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model]
  if (!costs) return 0
  return (inputTokens / 1000 * costs.input) + (outputTokens / 1000 * costs.output)
}

export function formatCost(usd: number): string {
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m` // millicents
  return `$${usd.toFixed(4)}`
}
