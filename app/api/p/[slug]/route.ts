import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

/** GET /api/p/[slug] — public score card data */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const svc = getServiceClient()

  const { data: patent } = await svc
    .from('patents')
    .select('id, title, filing_date, status, score_card_enabled, public_slug')
    .eq('public_slug', slug)
    .eq('score_card_enabled', true)
    .single()

  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get scores from claw_patents
  const { data: cp } = await svc
    .from('claw_patents')
    .select('novelty_score, commercial_score, filing_complexity, composite_score, novelty_rationale')
    .eq('patent_id', patent.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Log view (non-blocking)
  svc.from('score_card_views').insert({
    patent_id: patent.id,
    referrer: req.headers.get('referer') ?? null,
    user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
  })
  // fire-and-forget view log

  return NextResponse.json({
    title: patent.title,
    filing_date: patent.filing_date,
    status: patent.status,
    slug: patent.public_slug,
    novelty_score: cp?.novelty_score ?? null,
    viability_score: cp?.commercial_score ?? null,
    complexity_score: cp?.filing_complexity ?? null,
    composite_score: cp?.composite_score ?? null,
    summary: cp?.novelty_rationale?.slice(0, 200) ?? null,
  })
}
