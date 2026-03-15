import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendClaimsReadyEmail } from '@/lib/email'
import { scoreClaimsDraft } from '@/lib/claims-score'

export const dynamic = 'force-dynamic'

const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

// GET /api/cron/process-revisions
// Called by Vercel Cron every 60s.
// Picks up ONE pending revision request, calls Gemini to produce revised claims,
// updates the patent record, and notifies the patent owner via email.
export async function GET(req: NextRequest) {
  // ── Auth: verify CRON_SECRET ─────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const querySecret = req.nextUrl.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (!expected) {
    console.error('[process-revisions] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : querySecret
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Pick up oldest pending revision request ──────────────────────────────
  const { data: queueRows, error: fetchErr } = await supabase
    .from('review_queue')
    .select('id, patent_id, owner_id, content, title')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (fetchErr) {
    console.error('[process-revisions] failed to query review_queue:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!queueRows || queueRows.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No pending revisions' })
  }

  const queueRow = queueRows[0]

  // ── Optimistic lock: set to 'processing' before doing any work ───────────
  const { error: lockErr } = await supabase
    .from('review_queue')
    .update({ status: 'processing' })
    .eq('id', queueRow.id)
    .eq('status', 'pending') // guard against race — only update if still pending

  if (lockErr) {
    console.error('[process-revisions] failed to lock queue row:', lockErr)
    return NextResponse.json({ error: 'Failed to acquire lock', details: lockErr.message }, { status: 500 })
  }

  console.log(`[process-revisions] locked queue row ${queueRow.id} for patent ${queueRow.patent_id}`)

  // ── Fetch associated patent ──────────────────────────────────────────────
  const { data: patent, error: patentErr } = await supabase
    .from('patents')
    .select('id, title, claims_draft, abstract_draft, owner_id')
    .eq('id', queueRow.patent_id)
    .single()

  if (patentErr || !patent) {
    console.error('[process-revisions] patent not found for id:', queueRow.patent_id)
    await supabase.from('review_queue').update({ status: 'failed' }).eq('id', queueRow.id)
    return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  }

  try {
    // ── Build revision prompt ──────────────────────────────────────────────
    const prompt = buildRevisionPrompt(patent, queueRow.content)

    // ── Call Gemini ────────────────────────────────────────────────────────
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,      // low temp — legally critical output
          maxOutputTokens: 8192,
        },
      }),
    })

    if (!geminiRes.ok) {
      throw new Error(`Gemini API error: ${geminiRes.status} ${await geminiRes.text()}`)
    }

    const geminiData = await geminiRes.json()
    const revisedDraft = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!revisedDraft) {
      throw new Error('Gemini returned empty revised draft')
    }

    // ── Update patent with revised claims ─────────────────────────────────
    const { error: patentUpdateErr } = await supabase
      .from('patents')
      .update({
        claims_draft: revisedDraft,
        claims_status: 'complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', patent.id)

    if (patentUpdateErr) {
      throw new Error(`Failed to update patent: ${patentUpdateErr.message}`)
    }

    // ── Mark queue row complete ────────────────────────────────────────────
    await supabase
      .from('review_queue')
      .update({
        status: 'complete',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', queueRow.id)

    // ── Re-score claims after revision (fire-and-forget) ──────────────────
    const score = await scoreClaimsDraft(patent.id, revisedDraft)
    if (score) {
      await supabase
        .from('patents')
        .update({ claims_score: score })
        .eq('id', patent.id)
    }

    // ── Notify patent owner via email (fire-and-forget) ───────────────────
    const ownerEmail = await getOwnerEmail(queueRow.owner_id)
    await sendClaimsReadyEmail({
      to: ownerEmail,
      inventorName: null,
      inventionName: patent.title,
      patentId: patent.id,
    })

    console.log(
      `[process-revisions] ✅ revision complete — patent ${patent.id}, queue row ${queueRow.id}`
    )

    return NextResponse.json({
      processed: 1,
      patent_id: patent.id,
      queue_id: queueRow.id,
      status: 'complete',
    })

  } catch (err) {
    // ── Failure: mark failed, never crash ─────────────────────────────────
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[process-revisions] ❌ revision failed for queue row ${queueRow.id}:`, msg)

    await supabase
      .from('review_queue')
      .update({ status: 'failed' })
      .eq('id', queueRow.id)

    return NextResponse.json(
      { processed: 1, status: 'failed', queue_id: queueRow.id, error: msg },
      { status: 500 }
    )
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOwnerEmail(userId: string): Promise<string> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        headers: {
          apikey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'),
          Authorization: `Bearer ${(process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')}`,
        },
      }
    )
    if (!res.ok) {
      console.warn(`[process-revisions] could not fetch owner email for ${userId}: ${res.status}`)
      return ''
    }
    const user = await res.json()
    return user?.email ?? ''
  } catch (err) {
    console.warn('[process-revisions] getOwnerEmail failed silently:', err)
    return ''
  }
}

function buildRevisionPrompt(
  patent: {
    title: string | null
    claims_draft: string | null
    abstract_draft: string | null
  },
  revisionNote: string
): string {
  const originalDraft = patent.claims_draft
    ? `ORIGINAL CLAIMS DRAFT:\n${patent.claims_draft}`
    : 'ORIGINAL CLAIMS DRAFT:\n(No prior draft on record — generate fresh claims that fully incorporate the revision instructions below.)'

  const abstractSection = patent.abstract_draft
    ? `\nABSTRACT:\n${patent.abstract_draft}\n`
    : ''

  return `You are a USPTO patent claims drafting assistant. A revision has been requested for the patent below. Produce a complete, updated set of patent claims incorporating all revision instructions. Output ONLY the claims — no preamble, no commentary, no markdown headers, no section titles. Use standard USPTO claim numbering and formatting.

PATENT TITLE: ${patent.title ?? 'Untitled'}
${abstractSection}
${originalDraft}

REVISION INSTRUCTIONS:
${revisionNote}

DRAFTING RULES:
- Incorporate the revision instructions fully into the revised claim set
- Maintain proper USPTO claim structure: at least 3 independent claims (method, system, computer-readable medium or apparatus) plus 8–12 dependent claims
- Each claim must be a single sentence ending with a period
- Independent claims must use broad structural language — no functional claiming
- Dependent claims must reference their parent: "The [system/method/apparatus] of claim X, wherein..."
- Preserve valid claims from the original draft that need no revision
- Do not include limitations not supported by the patent disclosure
- Number claims sequentially starting from 1

Begin revised claims now:`
}
