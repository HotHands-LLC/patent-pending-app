import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fetch current patent's score and tech_domain
  const { data: current } = await supabaseService
    .from('patents')
    .select('id, composite_score: claw_patents(composite_score), stage')
    .eq('id', id)
    .single()

  // Get claw scores for current patent
  const { data: currentClaw } = await supabaseService
    .from('claw_patents')
    .select('composite_score, tech_domain')
    .eq('patent_id', id)
    .single()

  const currentScore = currentClaw?.composite_score ?? null
  const currentDomain = currentClaw?.tech_domain ?? null

  // Fetch candidate patents: public-ready, not self
  const { data: candidates } = await supabaseService
    .from('patents')
    .select('id, title, slug, stage, status')
    .neq('id', id)
    .neq('status', 'archived')
    .eq('arc3_active', true)
    .not('slug', 'is', null)
    .or('investment_open.eq.true,status.eq.provisional')
    .limit(50)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ related: [] })
  }

  const candidateIds = candidates.map(c => c.id)

  // Get claw data for candidates
  const { data: clawRows } = await supabaseService
    .from('claw_patents')
    .select('patent_id, composite_score, tech_domain, novelty_narrative')
    .in('patent_id', candidateIds)

  const clawMap: Record<string, { composite_score: number | null; tech_domain: string | null; novelty_narrative: string | null }> = {}
  for (const r of clawRows ?? []) {
    clawMap[r.patent_id] = {
      composite_score: r.composite_score,
      tech_domain: r.tech_domain,
      novelty_narrative: r.novelty_narrative,
    }
  }

  // Score each candidate for relevance:
  //   +2 if same tech_domain as current
  //   +1 if composite_score within 15 of current
  type ScoredCandidate = {
    id: string
    title: string
    slug: string
    stage: string
    composite_score: number | null
    tech_domain: string | null
    novelty_narrative: string | null
    _relevance: number
  }

  const scored: ScoredCandidate[] = candidates.map(c => {
    const claw = clawMap[c.id] ?? { composite_score: null, tech_domain: null, novelty_narrative: null }
    let relevance = 0
    if (currentDomain && claw.tech_domain === currentDomain) relevance += 2
    if (currentScore != null && claw.composite_score != null &&
        Math.abs(claw.composite_score - currentScore) <= 15) relevance += 1
    return {
      id: c.id,
      title: c.title,
      slug: c.slug ?? '',
      stage: c.stage,
      composite_score: claw.composite_score,
      tech_domain: claw.tech_domain,
      novelty_narrative: claw.novelty_narrative ? claw.novelty_narrative.slice(0, 100) : null,
      _relevance: relevance,
    }
  })

  // Sort: by relevance desc, then composite_score desc; take top 3
  const related = scored
    .filter(c => c._relevance > 0 || currentDomain == null)
    .sort((a, b) => b._relevance - a._relevance || (b.composite_score ?? 0) - (a.composite_score ?? 0))
    .slice(0, 3)
    .map(({ _relevance: _, ...rest }) => rest)

  return NextResponse.json({ related })
}
