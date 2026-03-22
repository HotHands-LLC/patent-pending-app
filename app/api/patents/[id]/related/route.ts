import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Fetch current patent's scores + domain
  const { data: current } = await supabaseService
    .from('patents')
    .select('id, slug')
    .eq('id', id)
    .single()

  if (!current) return NextResponse.json({ related: [] })

  const { data: currentClaw } = await supabaseService
    .from('claw_patents')
    .select('composite_score, tech_domain')
    .eq('patent_id', id)
    .single()

  const currentScore  = currentClaw?.composite_score ?? 50
  const currentDomain = currentClaw?.tech_domain ?? null

  // Fetch candidate patents: investment_open OR provisional status, not archived, not self
  const { data: candidates } = await supabaseService
    .from('patents')
    .select('id, title, slug, stage, status')
    .neq('id', id)
    .neq('status', 'archived')
    .or('investment_open.eq.true,status.eq.provisional')
    .not('slug', 'is', null)
    .limit(50)

  if (!candidates?.length) return NextResponse.json({ related: [] })

  // Enrich with claw scores + domain
  const candidateIds = candidates.map(c => c.id)
  const { data: clawRows } = await supabaseService
    .from('claw_patents')
    .select('patent_id, composite_score, tech_domain, novelty_narrative')
    .in('patent_id', candidateIds)

  const clawMap: Record<string, { composite_score: number | null; tech_domain: string | null; novelty_narrative: string | null }> = {}
  for (const r of clawRows ?? []) {
    clawMap[r.patent_id] = {
      composite_score:  r.composite_score,
      tech_domain:      r.tech_domain,
      novelty_narrative: r.novelty_narrative,
    }
  }

  // Score each candidate by relatedness: same domain OR score within 15 points
  const scored = candidates
    .map(p => {
      const claw = clawMap[p.id]
      const pScore  = claw?.composite_score ?? 0
      const pDomain = claw?.tech_domain ?? null
      const sameDomain   = currentDomain && pDomain === currentDomain
      const nearScore    = Math.abs(pScore - currentScore) <= 15
      if (!sameDomain && !nearScore) return null
      return {
        id:               p.id,
        title:            p.title,
        slug:             p.slug,
        stage:            p.stage,
        composite_score:  pScore,
        tech_domain:      pDomain,
        novelty_narrative: claw?.novelty_narrative
          ? claw.novelty_narrative.slice(0, 100)
          : null,
        // Rank: same domain + near score > same domain only > near score only
        _rank: (sameDomain ? 2 : 0) + (nearScore ? 1 : 0),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b._rank - a._rank) || ((b.composite_score ?? 0) - (a.composite_score ?? 0)))
    .slice(0, 3)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _rank, ...r }) => r)

  return NextResponse.json({ related: scored })
}
