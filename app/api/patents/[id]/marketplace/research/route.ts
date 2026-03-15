import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * POST /api/patents/[id]/marketplace/research
 * Owner-only. Assembles context, calls claude-sonnet-4-6 for a structured marketing plan,
 * saves as a Correspondence record (type=ai_research), emails owner.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, title, abstract_draft, claims_draft, spec_draft, deal_page_brief, marketplace_research_status')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (patent.marketplace_research_status === 'pending') {
    return NextResponse.json({ error: 'Research already in progress' }, { status: 409 })
  }

  // Mark as pending
  await supabaseService
    .from('patents')
    .update({ marketplace_research_status: 'pending' })
    .eq('id', patentId)

  // ── Build context payload ────────────────────────────────────────────────────
  const brief = patent.deal_page_brief as Record<string, string> | null
  const claimsSummary = patent.claims_draft
    ? patent.claims_draft.split('\n').filter((l: string) => l.match(/^\s*(claim\s+1|1\.)/i)).slice(0, 3).join('\n')
      || patent.claims_draft.slice(0, 800)
    : '(not yet generated)'
  const specSummary = patent.spec_draft ? patent.spec_draft.slice(0, 500) : '(not yet uploaded)'
  const abstract = patent.abstract_draft || '(not yet generated)'

  const briefStr = brief
    ? `Problem: ${brief.problem ?? '—'}
Industries: ${brief.industries ?? '—'}
Evidence / Demos: ${brief.evidence ?? '—'}
Target Buyers: ${brief.buyers ?? '—'}
Ideal Outcome: ${brief.outcome ?? '—'}`
    : '(Marketplace interview not yet completed)'

  const researchPrompt = `You are a senior IP licensing strategist. Given the following patent, conduct a comprehensive market analysis and produce a structured marketing plan.

**Patent:** ${patent.title}

**Abstract:** ${abstract}

**Claims summary (top independent claims):**
${claimsSummary}

**Spec summary (first 500 chars):**
${specSummary}

**Owner's stated goals (Marketplace interview):**
${briefStr}

---

Produce a report with these sections:

## 1. Plain-English Summary
(2 paragraphs, zero jargon — as if explaining to a potential business buyer)

## 2. Problem It Solves
(bullet list, 3–5 specific, concrete points)

## 3. Target Industries
(ranked by fit — each with a 1-sentence rationale)

## 4. Potential Buyers / Licensees
(specific company types or named examples where obvious — be concrete)

## 5. Licensing Plays
(recommended deal structures with rationale — non-exclusive, exclusive, field-of-use, full acquisition)

## 6. Competitive Landscape
(2–3 comparable patents or products; how this invention differentiates)

## 7. Case Study Hooks
(hypothetical use cases per industry — concrete scenarios for deal page copy)

## 8. Recommended Deal Page Headlines
(3 options — punchy, benefit-led, buyer-focused)

---
Be specific. Be direct. Avoid generic filler. This report will be used to write the public deal page and pitch to potential licensees.`

  // ── Call claude-sonnet-4-6 ──────────────────────────────────────────────────
  let reportMarkdown = ''
  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': (process.env.ANTHROPIC_API_KEY ?? ''),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: researchPrompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      throw new Error(`Anthropic error ${anthropicRes.status}: ${errText.slice(0, 200)}`)
    }

    const anthropicData = await anthropicRes.json()
    reportMarkdown = anthropicData.content?.[0]?.text ?? ''
    if (!reportMarkdown) throw new Error('Empty response from Anthropic')
  } catch (err) {
    await supabaseService.from('patents').update({ marketplace_research_status: 'none' }).eq('id', patentId)
    console.error('[marketplace/research]', err)
    return NextResponse.json({ error: 'Research generation failed — try again.' }, { status: 500 })
  }

  // ── Save as Correspondence record ────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const { data: correspondence, error: corrErr } = await supabaseService
    .from('patent_correspondence')
    .insert({
      patent_id: patentId,
      owner_id: user.id,
      title: `Marketplace Research Plan — ${patent.title}`,
      type: 'ai_research',
      content: reportMarkdown,
      from_party: 'PatentPending AI',
      to_party: 'Patent Owner',
      correspondence_date: today,
    })
    .select('id')
    .single()

  if (corrErr || !correspondence) {
    await supabaseService.from('patents').update({ marketplace_research_status: 'none' }).eq('id', patentId)
    return NextResponse.json({ error: 'Failed to save research record' }, { status: 500 })
  }

  // ── Mark complete ────────────────────────────────────────────────────────────
  await supabaseService
    .from('patents')
    .update({ marketplace_research_status: 'complete' })
    .eq('id', patentId)

  // ── Email owner ──────────────────────────────────────────────────────────────
  try {
    const ownerAuth = await supabaseService.auth.admin.getUserById(user.id)
    const ownerEmail = ownerAuth.data.user?.email
    if (ownerEmail) {
      const corrUrl = `${APP_URL}/dashboard/patents/${patentId}?tab=correspondence`
      await sendEmail(buildEmail({
        to: ownerEmail,
        subject: `Your patent marketing plan is ready — ${patent.title}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">Marketing Research Plan Ready 📊</h2>
  <p>Your Marketplace research plan for <strong>"${patent.title}"</strong> has been generated.</p>
  <p>It covers: Plain-English summary, target industries, potential buyers, licensing structures, competitive landscape, and 3 deal page headline options.</p>
  <p style="margin-top:20px">
    <a href="${corrUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
      View in Correspondence →
    </a>
  </p>
</div>`,
      }))
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    correspondence_id: correspondence.id,
    status: 'complete',
  })
}
