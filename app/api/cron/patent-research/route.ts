import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { FROM_DEFAULT, withFooter, htmlToText } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * POST /api/cron/patent-research
 *
 * Patent Intelligence background job.
 * Called by OpenClaw cron (weekly) or manually via admin panel.
 *
 * Flow:
 *  1. Load all active patents that have a title (and optional description/claims)
 *  2. For each patent, run 2-3 Brave Search queries (prior art + market intel)
 *  3. Score and classify each result
 *  4. Upsert into patent_research_findings (deduplicated by source_url per patent)
 *  5. Insert a patent_correspondence entry so findings appear in patent timeline
 *  6. Email owners who have research_notifications=true
 *
 * Auth: CRON_SECRET header OR service_role JWT.
 * Rate limited: skips patents researched within the last 6 days.
 */

const serviceClient = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getResend() {
  return new Resend((process.env.RESEND_API_KEY ?? 'placeholder-resend-key'))
}

const BRAVE_KEY = process.env.BRAVE_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
const CRON_SECRET = process.env.CRON_SECRET

// ── Types ─────────────────────────────────────────────────────────────────────

interface BraveResult {
  title: string
  url: string
  description: string
}

interface FindingInput {
  patent_id: string
  owner_id: string
  run_id: string
  finding_type: string
  title: string
  summary: string
  source_url: string
  source_name: string
  snippet: string
  relevance_score: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function braveSearch(query: string, count = 5): Promise<BraveResult[]> {
  if (!BRAVE_KEY) {
    console.warn('[patent-research] No BRAVE_API_KEY — using empty results')
    return []
  }
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&freshness=py`,
      { headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_KEY } }
    )
    if (!res.ok) {
      console.error(`[patent-research] Brave search failed: ${res.status}`)
      return []
    }
    const data = await res.json()
    return (data.web?.results ?? []).map((r: { title: string; url: string; description: string }) => ({
      title: r.title,
      url: r.url,
      description: r.description ?? '',
    }))
  } catch (err) {
    console.error('[patent-research] Brave search error:', err)
    return []
  }
}

function classifyResult(url: string, snippet: string): { type: string; score: number } {
  const urlLower = url.toLowerCase()
  const textLower = (snippet ?? '').toLowerCase()

  // Prior art: patent databases
  if (urlLower.includes('patents.google') || urlLower.includes('patents.justia') ||
      urlLower.includes('espacenet') || urlLower.includes('patentcenter') ||
      urlLower.includes('scholar.google')) {
    return { type: 'prior_art', score: 8 }
  }

  // Legal: USPTO, IPO, patent news
  if (urlLower.includes('uspto.gov') || urlLower.includes('ip-watch') ||
      urlLower.includes('patentlyo') || urlLower.includes('ipwatchdog')) {
    return { type: 'legal', score: 6 }
  }

  // Market intel: funding, investment, VC
  if (textLower.includes('funding') || textLower.includes('raised') ||
      textLower.includes('series a') || textLower.includes('investment') ||
      urlLower.includes('crunchbase') || urlLower.includes('techcrunch')) {
    return { type: 'market_intel', score: 6 }
  }

  // Competitor: product/company announcements
  if (textLower.includes('launch') || textLower.includes('announces') ||
      textLower.includes('product') || textLower.includes('startup')) {
    return { type: 'competitor', score: 5 }
  }

  return { type: 'news', score: 4 }
}

function buildQueries(patent: {
  title: string
  description: string | null
  tags: string[]
  claims_draft: string | null
}): string[] {
  const title = patent.title
  const tags = patent.tags?.slice(0, 3) ?? []
  const queries: string[] = []

  // Prior art search
  queries.push(`"${title}" patent prior art`)
  if (tags.length > 0) {
    queries.push(`${tags.join(' ')} patent USPTO filing`)
  }
  // Market intel
  queries.push(`${title} startup investment market 2025 2026`)

  return queries
}

function buildFindingsEmail(
  ownerName: string,
  patentTitle: string,
  patentId: string,
  findings: FindingInput[]
): string {
  const patentUrl = `${APP_URL}/dashboard/patents/${patentId}`
  const newFindings = findings.filter(f => f.relevance_score >= 6)

  const rows = newFindings.slice(0, 8).map(f => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;
          background:${f.finding_type === 'prior_art' ? '#fee2e2' : f.finding_type === 'competitor' ? '#fef3c7' : '#ede9fe'};
          color:${f.finding_type === 'prior_art' ? '#991b1b' : f.finding_type === 'competitor' ? '#92400e' : '#4c1d95'};">
          ${f.finding_type.replace('_', ' ')}
        </span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <a href="${f.source_url}" style="font-size:14px;font-weight:600;color:#1a1f36;text-decoration:none;">${f.title}</a>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${f.summary}</p>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
        <span style="font-size:14px;font-weight:700;color:${f.relevance_score >= 8 ? '#dc2626' : '#d97706'};">${f.relevance_score}/10</span>
      </td>
    </tr>`).join('')

  return withFooter(`
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:#1a1f36;color:white;padding:24px;border-radius:8px 8px 0 0;">
        <p style="margin:0;font-size:12px;opacity:0.7;text-transform:uppercase;letter-spacing:0.05em;">Patent Intelligence Report</p>
        <h1 style="margin:8px 0 0;font-size:20px;">${patentTitle}</h1>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
        <p style="color:#374151;font-size:15px;">Hi ${ownerName},</p>
        <p style="color:#374151;font-size:15px;">Pattie found <strong>${newFindings.length} new research finding${newFindings.length !== 1 ? 's' : ''}</strong> for your patent:</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;">Type</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;">Finding</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;">Score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <a href="${patentUrl}#research" style="display:inline-block;padding:12px 24px;background:#1a1f36;color:white;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px;">
          View All Findings →
        </a>
      </div>
    </div>`, `${APP_URL}/profile?unsubscribe=research`)
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  // Manual triggers send: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
  // If CRON_SECRET is not set, endpoint is open (dev / first deploy only).
  if (CRON_SECRET) {
    const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (bearer !== CRON_SECRET && bearer !== serviceKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Parse options ──────────────────────────────────────────────────────────
  let body: { patent_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* no body = run all */ }

  const { patent_id: targetPatentId, force = false } = body

  console.log(`[patent-research] Starting run | patent_id=${targetPatentId ?? 'all'} | force=${force}`)

  // ── Load patents ───────────────────────────────────────────────────────────
  let patentsQuery = serviceClient
    .from('patents')
    .select('id, owner_id, title, description, tags, claims_draft, filing_date, status')
    .not('title', 'is', null)
    .not('status', 'eq', 'abandoned')

  if (targetPatentId) {
    patentsQuery = patentsQuery.eq('id', targetPatentId)
  }

  const { data: patents, error: patentsErr } = await patentsQuery
  if (patentsErr || !patents?.length) {
    return NextResponse.json({ ok: true, message: 'No active patents found', patents_researched: 0 })
  }

  // ── Load profiles for notification prefs ─────────────────────────────────
  const ownerIds = [...new Set(patents.map(p => p.owner_id))]
  const { data: profilesData } = await serviceClient
    .from('profiles')
    .select('id, display_name, email, research_notifications')
    .in('id', ownerIds)

  const profileMap = new Map((profilesData ?? []).map(p => [p.id, p]))

  const results: { patent_id: string; title: string; new_findings: number; skipped?: boolean }[] = []

  for (const patent of patents) {
    // ── Skip if researched recently (within 6 days) ────────────────────────
    if (!force) {
      const { data: recentRun } = await serviceClient
        .from('patent_research_runs')
        .select('id, created_at')
        .eq('patent_id', patent.id)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (recentRun) {
        const daysAgo = (Date.now() - new Date(recentRun.created_at).getTime()) / (1000 * 60 * 60 * 24)
        if (daysAgo < 6) {
          results.push({ patent_id: patent.id, title: patent.title, new_findings: 0, skipped: true })
          continue
        }
      }
    }

    // ── Create run record ──────────────────────────────────────────────────
    const { data: run } = await serviceClient
      .from('patent_research_runs')
      .insert({
        patent_id: patent.id,
        owner_id: patent.owner_id,
        run_type: targetPatentId ? 'manual' : 'scheduled',
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!run) continue

    try {
      const queries = buildQueries(patent)
      const allFindings: FindingInput[] = []
      const seenUrls = new Set<string>()

      // ── Run searches ────────────────────────────────────────────────────
      for (const query of queries) {
        const results_raw = await braveSearch(query, 5)
        for (const r of results_raw) {
          if (!r.url || seenUrls.has(r.url)) continue
          seenUrls.add(r.url)

          const { type, score } = classifyResult(r.url, r.description)
          allFindings.push({
            patent_id: patent.id,
            owner_id: patent.owner_id,
            run_id: run.id,
            finding_type: type,
            title: r.title.slice(0, 500),
            summary: r.description.slice(0, 600),
            source_url: r.url,
            source_name: new URL(r.url).hostname.replace('www.', ''),
            snippet: r.description.slice(0, 1000),
            relevance_score: score,
          })
        }
        // Small delay between searches to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      if (!allFindings.length) {
        await serviceClient.from('patent_research_runs').update({
          status: 'complete',
          findings_count: 0,
          new_findings_count: 0,
          queries_used: queries,
          completed_at: new Date().toISOString(),
        }).eq('id', run.id)
        results.push({ patent_id: patent.id, title: patent.title, new_findings: 0 })
        continue
      }

      // ── Upsert findings (deduplicate by patent_id + source_url) ──────────
      const { data: upserted, error: upsertErr } = await serviceClient
        .from('patent_research_findings')
        .upsert(allFindings, { onConflict: 'patent_id,source_url', ignoreDuplicates: false })
        .select('id, is_notified, finding_type, title, summary, source_url, relevance_score')

      if (upsertErr) {
        console.error(`[patent-research] Upsert error for patent ${patent.id}:`, upsertErr)
      }

      // New findings = those not yet notified
      const newFindings = (upserted ?? allFindings as unknown as typeof upserted ?? [])
        .filter((f: { is_notified?: boolean }) => !f.is_notified)

      // ── Insert correspondence entry ───────────────────────────────────────
      if (allFindings.length > 0) {
        const highPriority = allFindings.filter(f => f.relevance_score >= 8)
        await serviceClient.from('patent_correspondence').insert({
          patent_id: patent.id,
          owner_id: patent.owner_id,
          title: `Research Intelligence — ${allFindings.length} finding${allFindings.length !== 1 ? 's' : ''} (${highPriority.length} high priority)`,
          type: 'boclaw_note',
          content: `Pattie Research Run (${new Date().toISOString().split('T')[0]})\n\nQueries: ${queries.join(' | ')}\n\nTop findings:\n${allFindings.slice(0, 5).map(f => `• [${f.finding_type}] ${f.title} (${f.source_name}) — Relevance: ${f.relevance_score}/10`).join('\n')}`,
          from_party: 'Pattie',
          to_party: 'Inventor',
          correspondence_date: new Date().toISOString().split('T')[0],
          attachments: [],
          tags: ['research', 'intelligence', 'automated'],
        })
      }

      // ── Update run record ─────────────────────────────────────────────────
      await serviceClient.from('patent_research_runs').update({
        status: 'complete',
        findings_count: allFindings.length,
        new_findings_count: newFindings?.length ?? 0,
        queries_used: queries,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)

      // ── Email notification ─────────────────────────────────────────────────
      const profile = profileMap.get(patent.owner_id)
      const notifiableFindings = allFindings.filter(f => f.relevance_score >= 6)

      if (profile?.email && profile?.research_notifications !== false && notifiableFindings.length > 0) {
        try {
          const resend = getResend()
          const html = buildFindingsEmail(
            profile.display_name ?? 'there',
            patent.title,
            patent.id,
            notifiableFindings as FindingInput[]
          )
          await resend.emails.send({
            from: FROM_DEFAULT,
            to: profile.email,
            subject: `🔍 ${notifiableFindings.length} new finding${notifiableFindings.length !== 1 ? 's' : ''} for "${patent.title}"`,
            html,
            text: htmlToText(html),
          })

          // Mark findings as notified
          if (upserted?.length) {
            await serviceClient
              .from('patent_research_findings')
              .update({ is_notified: true, notified_at: new Date().toISOString() })
              .in('id', upserted.map((f: { id: string }) => f.id))
              .eq('patent_id', patent.id)
          }
        } catch (emailErr) {
          console.error(`[patent-research] Email failed for ${profile.email}:`, emailErr)
        }
      }

      results.push({ patent_id: patent.id, title: patent.title, new_findings: newFindings?.length ?? 0 })

    } catch (patentErr) {
      console.error(`[patent-research] Error processing patent ${patent.id}:`, patentErr)
      await serviceClient.from('patent_research_runs').update({
        status: 'failed',
        error_message: String(patentErr),
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)
    }
  }

  const totalNew = results.reduce((sum, r) => sum + r.new_findings, 0)
  console.log(`[patent-research] Done | patents=${results.length} | new_findings=${totalNew}`)

  return NextResponse.json({
    ok: true,
    patents_researched: results.filter(r => !r.skipped).length,
    patents_skipped: results.filter(r => r.skipped).length,
    total_new_findings: totalNew,
    results,
  })
}

// Allow GET for health check / manual trigger from admin panel
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Patent research cron endpoint. POST to run.' })
}
