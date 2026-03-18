/**
 * GET /api/cron/autoresearch
 * Nightly autoresearch cron — runs all active saved queries against USPTO ODP,
 * scores results, upserts high-scoring (≥70) findings to research_results.
 *
 * Schedule: 0 9 * * * (09:00 UTC = 03:00 MDT)
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Returns: { ran: N, new_results: M, errors: [...] }
 *
 * No module-level Supabase client. (Standing rule.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scorePatent } from '@/lib/autoresearch/score-patent'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300  // 5 min — may fan out many ODP queries

const USPTO_BASE = 'https://api.uspto.gov/api/v1/patent/applications/search'
const SCORE_THRESHOLD = 70

// ── Types ─────────────────────────────────────────────────────────────────────
interface SavedQuery {
  id:       string
  label:    string
  cpc_codes: string[] | null
  keywords: string[] | null
  patent_id: string | null
}

interface OdpApplication {
  applicationMetaData?: {
    inventionTitle?: string
    applicationStatusDescriptionText?: string
    filingDate?: string
    firstInventorName?: string
    applicationStatusCode?: number
    cpcClassificationBag?: string[]
  }
  applicationNumberText?: string
  patentNumberText?: string
  eventDataBag?: Array<{
    eventCode?: string
    eventDescriptionText?: string
    eventDate?: string
  }>
}

function extractAbandonment(app: OdpApplication) {
  const events = app.eventDataBag ?? []
  const e = events.find(ev =>
    ev.eventCode === 'ABANDON' ||
    (ev.eventDescriptionText ?? '').toLowerCase().includes('abandon')
  )
  return { date: e?.eventDate, reason: e?.eventDescriptionText }
}

function isAbandoned(app: OdpApplication): boolean {
  const code = app.applicationMetaData?.applicationStatusCode
  if (code === 62) return true
  const desc = (app.applicationMetaData?.applicationStatusDescriptionText ?? '').toLowerCase()
  return desc.includes('abandon') || desc.includes('disposed')
}

async function queryUSPTO(
  keywords: string[],
  cpcCodes: string[],
): Promise<OdpApplication[]> {
  const USPTO_KEY = process.env.USPTO_ODP_API_KEY ?? ''

  // CPC pre-filter first (required before keyword scoring is meaningful)
  const parts: string[] = []
  if (cpcCodes.length)  parts.push(cpcCodes.join(' '))
  if (keywords.length)  parts.push(keywords.join(' '))

  const q = parts.join(' ').trim()
  if (!q) return []

  const params = new URLSearchParams({ q, limit: '20', start: '0' })
  const url = `${USPTO_BASE}?${params}`

  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': USPTO_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      console.warn('[cron/autoresearch] USPTO ODP non-OK:', res.status, 'q=', q)
      return []
    }
    const data = await res.json()
    return (data.patentFileWrapperDataBag ?? []) as OdpApplication[]
  } catch (err) {
    console.error('[cron/autoresearch] USPTO fetch error:', err)
    return []
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // ── Auth: CRON_SECRET ──────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
  )

  // ── Fetch active saved queries ─────────────────────────────────────────────
  const { data: queries, error: qErr } = await supabase
    .from('research_saved_queries')
    .select('id, label, cpc_codes, keywords, patent_id')
    .eq('is_active', true)

  if (qErr) {
    console.error('[cron/autoresearch] Failed to fetch saved queries:', qErr)
    return NextResponse.json({ error: 'DB error fetching queries' }, { status: 500 })
  }

  const savedQueries = (queries ?? []) as SavedQuery[]
  if (savedQueries.length === 0) {
    return NextResponse.json({ ran: 0, new_results: 0, message: 'No active saved queries' })
  }

  let totalNewResults = 0
  const errors: string[] = []

  // ── Run each query ─────────────────────────────────────────────────────────
  for (const query of savedQueries) {
    try {
      const keywords = query.keywords ?? []
      const cpcCodes = query.cpc_codes ?? []

      const apps = await queryUSPTO(keywords, cpcCodes)

      // Score each result and collect those ≥ threshold
      const queryId = crypto.randomUUID()
      const toUpsert = []

      for (const app of apps) {
        const meta       = app.applicationMetaData ?? {}
        const abandonment = extractAbandonment(app)
        const cpcCodes   = meta.cpcClassificationBag ?? []

        const { score, desjardinsFlag } = scorePatent({
          title:             meta.inventionTitle ?? 'Untitled',
          abstract:          '',
          claimCount:        0,
          filingDate:        meta.filingDate ?? '',
          abandonmentDate:   abandonment.date,
          abandonmentReason: abandonment.reason,
          cpcCodes,
          hasDrawings:       false,
        })

        if (score < SCORE_THRESHOLD) continue

        toUpsert.push({
          query_id:           queryId,
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
          source:             'uspto_odp_cron',
          raw_data:           app,
          query_params:       { keywords, cpcCodes, savedQueryId: query.id, label: query.label },
          created_by:         null,  // cron — no user
          // If associated with a patent, tag it
          ...(query.patent_id ? { patent_id: query.patent_id } : {}),
        })
      }

      // Upsert to research_results — dedup on application_number
      let netNew = 0
      if (toUpsert.length > 0) {
        const { data: upserted, error: upsertErr } = await supabase
          .from('research_results')
          .upsert(toUpsert, {
            onConflict: 'application_number',
            ignoreDuplicates: true,
          })
          .select('id, application_number, title, inventor_names, filing_date, cpc_codes')

        if (upsertErr) {
          console.error(`[cron/autoresearch] Upsert error for query "${query.label}":`, upsertErr)
          errors.push(`${query.label}: upsert failed — ${upsertErr.message}`)
        } else {
          netNew = (upserted ?? []).length
          totalNewResults += netNew

          // Auto-add new results as IDS candidates for the associated patent
          if (query.patent_id && upserted && upserted.length > 0) {
            // Fetch patent owner_id for the IDS candidate insert
            const { data: patentRow } = await supabase
              .from('patents')
              .select('owner_id')
              .eq('id', query.patent_id)
              .single()

            if (patentRow?.owner_id) {
              const idsCandidates = upserted.map(r => ({
                patent_id:          query.patent_id,
                owner_id:           patentRow.owner_id,
                research_result_id: r.id,
                application_number: r.application_number ?? null,
                title:              r.title ?? 'Untitled',
                inventor_names:     r.inventor_names ?? null,
                filing_date:        r.filing_date ?? null,
                cpc_codes:          r.cpc_codes ?? null,
                status:             'pending',
                added_by:           'autoresearch',
              }))

              await supabase
                .from('research_ids_candidates')
                .upsert(idsCandidates, { onConflict: 'research_result_id', ignoreDuplicates: true })
                .then(({ error: idsErr }) => {
                  if (idsErr) console.error('[cron/autoresearch] IDS candidates insert error:', idsErr)
                  else console.log(`[cron/autoresearch] Added ${idsCandidates.length} IDS candidates for patent ${query.patent_id}`)
                })
            }
          }
        }
      }

      // Update saved query metadata
      await supabase
        .from('research_saved_queries')
        .update({
          last_run_at:       new Date().toISOString(),
          last_result_count: netNew,
        })
        .eq('id', query.id)

      console.log(`[cron/autoresearch] query="${query.label}" apps=${apps.length} scored=${toUpsert.length} new=${netNew}`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/autoresearch] Uncaught error for query "${query.label}":`, msg)
      errors.push(`${query.label}: ${msg}`)
    }

    // Rate limit: 500ms between ODP calls
    await new Promise(r => setTimeout(r, 500))
  }

  // ── Notify if new results found ────────────────────────────────────────────
  if (totalNewResults > 0) {
    console.log(`[cron/autoresearch] ✅ ${totalNewResults} new results found — admin notification sent`)
    // Notification: write a system correspondence record to flag for admin review
    await supabase
      .from('patent_correspondence')
      .insert({
        patent_id:           null,
        owner_id:            null,
        title:               `Autoresearch: ${totalNewResults} new results found`,
        type:                'system_notification',
        content:             `Nightly autoresearch cron ran ${savedQueries.length} queries. ${totalNewResults} new results scored ≥${SCORE_THRESHOLD} and added to research_results. ${errors.length > 0 ? `Errors: ${errors.join('; ')}` : 'No errors.'}`,
        from_party:          'Autoresearch Cron',
        correspondence_date: new Date().toISOString().split('T')[0],
        tags:                ['cron', 'autoresearch', 'nightly'],
      })
      .then(({ error }) => { if (error) console.warn('[cron/autoresearch] notification insert failed:', error) })
  }

  return NextResponse.json({
    ran:         savedQueries.length,
    new_results: totalNewResults,
    errors:      errors.length > 0 ? errors : undefined,
  })
}
