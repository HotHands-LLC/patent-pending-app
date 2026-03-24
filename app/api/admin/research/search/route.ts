/**
 * POST /api/admin/research/search
 * Admin-only. Queries USPTO ODP for patents matching criteria,
 * scores each result, caches in research_results, returns scored array.
 *
 * Body: { keywords: string, cpcCode?: string, dateFrom?: string, dateTo?: string, statusFilter: 'abandoned' | 'all' }
 * Returns: { queryId: string, results: ScoredPatent[], source: string, fallback?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scorePatent } from '@/lib/autoresearch/score-patent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Supabase clients ──────────────────────────────────────────────────────────
const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL   ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

async function getAdminUser(token: string) {
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService
    .from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// ── USPTO ODP helpers ─────────────────────────────────────────────────────────
const USPTO_BASE = 'https://api.uspto.gov/api/v1/patent/applications/search'
const USPTO_KEY  = process.env.USPTO_ODP_API_KEY ?? ''

interface OdpApplication {
  applicationMetaData?: {
    inventionTitle?: string
    applicationStatusDescriptionText?: string
    filingDate?: string
    firstInventorName?: string
    applicationStatusCode?: number
    cpcClassificationBag?: string[]
    groupArtUnitNumber?: string
    examinerNameText?: string
  }
  applicationNumberText?: string
  patentNumberText?: string
  eventDataBag?: Array<{
    eventCode?: string
    eventDescriptionText?: string
    eventDate?: string
  }>
}

function extractAbandonment(app: OdpApplication): { date?: string; reason?: string } {
  const events = app.eventDataBag ?? []
  const abandEvent = events.find(e =>
    e.eventCode === 'ABANDON' ||
    (e.eventDescriptionText ?? '').toLowerCase().includes('abandon')
  )
  return {
    date:   abandEvent?.eventDate,
    reason: abandEvent?.eventDescriptionText,
  }
}

function isAbandoned(app: OdpApplication): boolean {
  const statusCode = app.applicationMetaData?.applicationStatusCode
  // USPTO status codes 150+ = disposed/abandoned range; 62 = abandoned
  if (statusCode === 62) return true
  const desc = (app.applicationMetaData?.applicationStatusDescriptionText ?? '').toLowerCase()
  return desc.includes('abandon') || desc.includes('disposed')
}

async function queryUSPTO(
  keywords: string,
  cpcCode: string,
  dateFrom: string,
  dateTo: string,
  statusFilter: string
): Promise<{ apps: OdpApplication[]; source: string; fallback: boolean }> {

  // Build query
  const parts: string[] = []
  if (keywords.trim()) parts.push(keywords.trim())
  if (cpcCode.trim())  parts.push(cpcCode.trim())

  const q = parts.join(' ')
  const params = new URLSearchParams({ q, limit: '20', start: '0' })
  if (dateFrom) params.set('dateRangeData.startDate', `${dateFrom}-01-01`)
  if (dateTo)   params.set('dateRangeData.endDate',   `${dateTo}-12-31`)

  const url = `${USPTO_BASE}?${params}`

  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': USPTO_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      console.warn('[autoresearch/search] USPTO ODP non-OK:', res.status)
      return { apps: [], source: 'uspto_odp', fallback: true }
    }

    const data = await res.json()
    const apps: OdpApplication[] = data.patentFileWrapperDataBag ?? []

    // Filter abandoned if requested
    const filtered = statusFilter === 'abandoned'
      ? apps.filter(isAbandoned)
      : apps

    return { apps: filtered, source: 'uspto_odp', fallback: false }
  } catch (err) {
    console.error('[autoresearch/search] USPTO fetch error:', err)
    return { apps: [], source: 'uspto_odp', fallback: true }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getAdminUser(token)
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    keywords?:    string
    cpcCode?:     string
    dateFrom?:    string
    dateTo?:      string
    statusFilter?: string
  }

  const { keywords = '', cpcCode = '', dateFrom = '', dateTo = '', statusFilter = 'abandoned' } = body

  if (!keywords.trim() && !cpcCode.trim()) {
    return NextResponse.json({ error: 'keywords or cpcCode is required' }, { status: 400 })
  }

  // Query USPTO
  const { apps, source, fallback } = await queryUSPTO(keywords, cpcCode, dateFrom, dateTo, statusFilter)

  if (fallback && apps.length === 0) {
    return NextResponse.json({ error: 'USPTO API unavailable', fallback: true }, { status: 503 })
  }

  // Score results
  const queryId = crypto.randomUUID()
  const queryParams = { keywords, cpcCode, dateFrom, dateTo, statusFilter }

  const scoredResults = apps.map(app => {
    const meta      = app.applicationMetaData ?? {}
    const abandonment = extractAbandonment(app)
    const cpcCodes  = meta.cpcClassificationBag ?? []

    const patentData = {
      title:             meta.inventionTitle ?? 'Untitled',
      abstract:          '',   // ODP file wrapper doesn't return abstract in this endpoint
      claimCount:        0,    // Not available in file wrapper summary
      filingDate:        meta.filingDate ?? '',
      abandonmentDate:   abandonment.date,
      abandonmentReason: abandonment.reason,
      cpcCodes,
      hasDrawings:       false,
    }

    const { score, desjardinsFlag, breakdown } = scorePatent(patentData)

    return {
      queryId,
      patent_number:      app.patentNumberText ?? null,
      application_number: app.applicationNumberText ?? null,
      title:              meta.inventionTitle ?? 'Untitled',
      abstract:           null,
      filing_date:        meta.filingDate ?? null,
      abandonment_date:   abandonment.date ?? null,
      abandonment_reason: abandonment.reason ?? null,
      cpc_codes:          cpcCodes.length ? cpcCodes : null,
      claim_count:        null,
      assignee:           null,
      inventor_names:     meta.firstInventorName ? [meta.firstInventorName] : null,
      readiness_score:    score,
      desjardins_flag:    desjardinsFlag,
      source,
      raw_data:           app,
      query_params:       queryParams,
      created_by:         user.id,
      // UI-only breakdown — not stored
      _breakdown:         breakdown,
    }
  })

  // Cache to DB (batch insert, skip _breakdown)
  const toInsert = scoredResults.map(({ _breakdown, ...rest }) => ({ ...rest, query_id: queryId }))

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabaseService
      .from('research_results')
      .insert(toInsert)

    if (insertErr) {
      console.error('[autoresearch/search] DB insert error:', insertErr)
      // Non-fatal — still return results even if cache fails
    }
  }

  return NextResponse.json({
    queryId,
    results: scoredResults.sort((a, b) => b.readiness_score - a.readiness_score),
    source,
    fallback,
    total: scoredResults.length,
  })
}
