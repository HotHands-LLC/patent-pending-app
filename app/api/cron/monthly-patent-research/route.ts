/**
 * /api/cron/monthly-patent-research
 *
 * Monthly research report generation for patents in the 12-month enhancement period.
 * Schedule: 1st of each month at 9:00 AM CT (via vercel.json cron)
 *
 * Feature flag: set ENABLE_MONTHLY_RESEARCH=true in Vercel env to activate.
 * Without the flag, the route returns 200 with a skipped message (safe to deploy disabled).
 *
 * Logic:
 *   For each patent WHERE filing_status = 'provisional_filed'
 *     AND nonprov_deadline_at > NOW()
 *     AND provisional_filed_at <= NOW() - INTERVAL '1 month'  (at least 1 month since filing)
 *     AND no report exists for current report_month:
 *   1. Call Gemini 2.5 Flash with research prompt
 *   2. Save to patent_research_reports
 *   3. Email owner via Resend
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const maxDuration = 300  // 5 min — may process multiple patents

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const RESEARCH_PROMPT = (title: string, claims: string, specExcerpt: string) => `
You are a patent researcher assisting an inventor during the 12-month enhancement period after their provisional patent filing.

Patent title: "${title}"

Current claims draft:
${claims.slice(0, 3000)}

Specification excerpt:
${specExcerpt.slice(0, 2000)}

Please provide a structured research report with exactly these three sections:

## A. Claim Refinements (3-5 suggestions)
Identify specific claims or claim language that could be strengthened, broadened, or added. For each suggestion, explain WHY it improves the patent's scope or defensibility.

## B. Prior Art to Be Aware Of (2-3 items)
Identify relevant patents, publications, or products that are prior art to this invention. For each, note the publication/patent number if applicable and explain how it relates to this invention's claims.

## C. New Embodiments to Document (1-2 suggestions)
Suggest specific new variations, applications, or implementations of the invention that the inventor should consider documenting in the non-provisional to broaden protection.

Keep each section concise and actionable. The inventor will review this report and decide which suggestions to incorporate.
`.trim()

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron routes)
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Feature flag check
  if (process.env.ENABLE_MONTHLY_RESEARCH !== 'true') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: 'Monthly research disabled. Set ENABLE_MONTHLY_RESEARCH=true to enable.',
    })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  const now = new Date()
  const reportMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const oneMonthAgo = new Date(now)
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  console.log(`[monthly-research] Starting run for report_month=${reportMonth}`)

  // Fetch eligible patents
  const { data: patents, error: fetchError } = await supabase
    .from('patents')
    .select(`
      id, title, claims_draft, spec_draft, owner_id,
      provisional_filed_at, nonprov_deadline_at,
      patent_profiles!inner(email, name_first, name_last)
    `)
    .eq('filing_status', 'provisional_filed')
    .gt('nonprov_deadline_at', now.toISOString())
    .lte('provisional_filed_at', oneMonthAgo.toISOString())

  if (fetchError) {
    console.error('[monthly-research] fetch error:', fetchError.message)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!patents?.length) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No eligible patents' })
  }

  const results: { patentId: string; title: string; status: string; error?: string }[] = []

  for (const patent of patents) {
    try {
      // Skip if report already exists for this month
      const { data: existing } = await supabase
        .from('patent_research_reports')
        .select('id')
        .eq('patent_id', patent.id)
        .eq('report_month', reportMonth)
        .single()

      if (existing) {
        results.push({ patentId: patent.id, title: patent.title, status: 'skipped_already_exists' })
        continue
      }

      if (!patent.claims_draft && !patent.spec_draft) {
        results.push({ patentId: patent.id, title: patent.title, status: 'skipped_no_content' })
        continue
      }

      // Call Gemini 2.5 Flash
      const prompt = RESEARCH_PROMPT(
        patent.title ?? 'Untitled',
        patent.claims_draft ?? '(no claims drafted yet)',
        patent.spec_draft ?? '(no specification yet)'
      )

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          }),
        }
      )

      if (!geminiRes.ok) {
        const errText = await geminiRes.text()
        throw new Error(`Gemini error ${geminiRes.status}: ${errText.slice(0, 200)}`)
      }

      const geminiData = await geminiRes.json()
      const rawReport = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      if (!rawReport) throw new Error('Empty Gemini response')

      // Save report
      const { error: insertError } = await supabase
        .from('patent_research_reports')
        .insert({
          patent_id:    patent.id,
          report_month: reportMonth,
          raw_report:   rawReport,
          status:       'pending_review',
        })

      if (insertError) throw new Error(`Insert error: ${insertError.message}`)

      // Send email via Resend
      const profile = Array.isArray(patent.patent_profiles)
        ? patent.patent_profiles[0]
        : patent.patent_profiles as Record<string, string> | null
      const ownerEmail = profile?.email
      const ownerName = [profile?.name_first, profile?.name_last].filter(Boolean).join(' ') || 'Inventor'
      const reportMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      const patentSlug = patent.id

      if (ownerEmail) {
        await resend.emails.send({
          from: 'PatentPending.app <notifications@patentpending.app>',
          to: ownerEmail,
          subject: `Monthly Research Update: ${patent.title ?? 'Your Patent'}`,
          text: `Hi ${ownerName},

Your ${reportMonthLabel} patent research report is ready for "${patent.title}".

SUMMARY PREVIEW:
${rawReport.slice(0, 500)}...

View the full report and take action at:
https://patentpending.app/dashboard/patents/${patentSlug}

(Open the Enhancement tab to review claim suggestions, prior art, and new embodiment ideas.)

---
This report was generated automatically by PatentPending.app as part of your 12-month enhancement period.
PatentPending.app is not a law firm. This is not legal advice.
Unsubscribe: manage notification preferences at patentpending.app/dashboard`,
        })
      }

      results.push({ patentId: patent.id, title: patent.title, status: 'ok' })
      console.log(`[monthly-research] ✓ ${patent.title} (${patent.id})`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[monthly-research] ✗ ${patent.id}: ${msg}`)
      results.push({ patentId: patent.id, title: patent.title, status: 'error', error: msg })
    }
  }

  const successful = results.filter(r => r.status === 'ok').length
  const skipped    = results.filter(r => r.status.startsWith('skipped')).length
  const failed     = results.filter(r => r.status === 'error').length

  return NextResponse.json({
    ok: true,
    report_month: reportMonth,
    processed: results.length,
    successful,
    skipped,
    failed,
    results,
  })
}
