import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateClaimsDraft } from '@/lib/claims-draft'
import { sendClaimsReadyEmail } from '@/lib/email'
import { scoreClaimsDraft } from '@/lib/claims-score'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/cron/generate-claims
// Called by Vercel Cron every 60s.
// Secured by CRON_SECRET — Vercel injects Authorization: Bearer <secret> on cron calls.
// Also accepts ?secret=<CRON_SECRET> for manual invocation.
export async function GET(req: NextRequest) {
  // ── Auth: verify CRON_SECRET ─────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const querySecret = req.nextUrl.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (!expected) {
    console.error('[cron] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : querySecret
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Pick up pending jobs ─────────────────────────────────────────────────
  const { data: pending, error: fetchErr } = await supabase
    .from('patents')
    .select('id, title, intake_session_id, claims_status')
    .eq('claims_status', 'pending')
    .limit(5) // Process up to 5 per invocation to stay within timeout

  if (fetchErr) {
    console.error('[cron] failed to fetch pending patents:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No pending jobs' })
  }

  console.log(`[cron] found ${pending.length} pending claim(s) to generate`)

  const results: { id: string; status: 'complete' | 'failed'; error?: string }[] = []

  for (const patent of pending) {
    // Mark as generating immediately to prevent duplicate pickup
    await supabase
      .from('patents')
      .update({ claims_status: 'generating' })
      .eq('id', patent.id)
      .eq('claims_status', 'pending') // Only if still pending (prevents race)

    try {
      // Fetch the full intake session for this patent
      let intake = null
      if (patent.intake_session_id) {
        const { data } = await supabase
          .from('patent_intake_sessions')
          .select('*')
          .eq('id', patent.intake_session_id)
          .single()
        intake = data
      }

      // If no intake session, build a minimal object from the patent record
      if (!intake) {
        const { data: fullPatent } = await supabase
          .from('patents')
          .select('title, description, inventors')
          .eq('id', patent.id)
          .single()
        intake = {
          id: patent.intake_session_id ?? patent.id,
          invention_name: fullPatent?.title ?? patent.title,
          problem_solved: fullPatent?.description ?? null,
          how_it_works: null,
          what_makes_it_new: null,
          inventor_name: fullPatent?.inventors?.[0] ?? null,
          co_inventors: fullPatent?.inventors?.slice(1) ?? [],
          micro_entity_eligible: null,
        }
      }

      await generateClaimsDraft(patent.id, intake)

      // Mark complete (generateClaimsDraft writes claims_draft to DB)
      await supabase
        .from('patents')
        .update({ claims_status: 'complete' })
        .eq('id', patent.id)

      // Generate filing readiness score — fire-and-forget, never crashes the job
      const { data: fresh } = await supabase
        .from('patents')
        .select('claims_draft')
        .eq('id', patent.id)
        .single()
      if (fresh?.claims_draft) {
        const score = await scoreClaimsDraft(patent.id, fresh.claims_draft)
        if (score) {
          await supabase
            .from('patents')
            .update({ claims_score: score })
            .eq('id', patent.id)
        }
      }

      // Notify inventor — fire-and-forget; failure never crashes the job
      await sendClaimsReadyEmail({
        to: intake.inventor_email ?? '',
        inventorName: intake.inventor_name ?? null,
        inventionName: intake.invention_name ?? null,
        patentId: patent.id,
      })

      console.log(`[cron] ✅ claims complete for patent ${patent.id}`)
      results.push({ id: patent.id, status: 'complete' })

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron] ❌ claims failed for patent ${patent.id}:`, msg)

      await supabase
        .from('patents')
        .update({ claims_status: 'failed' })
        .eq('id', patent.id)

      results.push({ id: patent.id, status: 'failed', error: msg })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  })
}
