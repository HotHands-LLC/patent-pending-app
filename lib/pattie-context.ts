/**
 * lib/pattie-context.ts — Persistent founder context layer for Pattie.
 *
 * Fetches pattie_context from DB + live patent data, returns a formatted
 * string ready to inject into any Pattie system prompt.
 *
 * P-Context / cont.52
 */
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

interface FounderContext {
  founder?: { name?: string; role?: string; company?: string; ip_entity?: string; story?: string }
  brand?: { name?: string; tagline?: string; mission?: string; url?: string; icp?: string }
  active_patents?: Array<{ id: string; title: string; status: string; deadline?: string }>
  channels?: string[]
  current_goals?: string[]
  tone?: string
}

/**
 * Fetch founder context for a brand and merge with live patent data.
 * Returns a formatted string to inject into Pattie's system prompt.
 * Returns empty string on any error (non-blocking).
 */
export async function getPattieContext(
  brand = 'pp.app',
  patentId?: string
): Promise<string> {
  try {
    const svc = getServiceClient()

    // Fetch stored context
    const { data: row } = await svc
      .from('pattie_context')
      .select('context_json')
      .eq('brand', brand)
      .single()

    if (!row?.context_json) return ''

    const ctx = row.context_json as FounderContext

    // Fetch live active patents (not archived, not research_import)
    const { data: patents } = await svc
      .from('patents')
      .select('id, title, status, provisional_deadline, filing_status')
      .not('status', 'in', '("abandoned","research_import")')
      .order('provisional_deadline', { ascending: true, nullsFirst: false })
      .limit(10)

    const activePatents = (patents ?? []).map(p => ({
      id: p.id,
      title: p.title,
      status: p.filing_status ?? p.status,
      deadline: p.provisional_deadline ?? undefined,
    }))

    // Build context string
    const lines: string[] = []

    lines.push('## Founder & Business Context')
    if (ctx.founder?.name) {
      lines.push(`Founder: ${ctx.founder.name} (${ctx.founder.role ?? 'Founder'})`)
    }
    if (ctx.founder?.company) lines.push(`Company: ${ctx.founder.company}`)
    if (ctx.founder?.story) lines.push(`Background: ${ctx.founder.story}`)

    if (ctx.brand) {
      lines.push(`\nPlatform: ${ctx.brand.name ?? 'patentpending.app'}`)
      if (ctx.brand.tagline) lines.push(`Tagline: "${ctx.brand.tagline}"`)
      if (ctx.brand.mission) lines.push(`Mission: ${ctx.brand.mission}`)
      if (ctx.brand.icp) lines.push(`Target user: ${ctx.brand.icp}`)
    }

    if (activePatents.length > 0) {
      lines.push(`\nActive patents (${activePatents.length}):`)
      for (const p of activePatents) {
        const deadline = p.deadline ? ` — deadline ${p.deadline}` : ''
        lines.push(`  • ${p.title} [${p.status}${deadline}]`)
      }
    }

    if (ctx.current_goals?.length) {
      lines.push(`\nCurrent priorities:`)
      for (const g of ctx.current_goals) lines.push(`  • ${g}`)
    }

    if (ctx.tone) lines.push(`\nTone: ${ctx.tone}`)

    return lines.join('\n')
  } catch {
    return '' // non-blocking — Pattie works without context
  }
}
