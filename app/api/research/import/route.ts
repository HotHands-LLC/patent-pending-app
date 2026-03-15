/**
 * POST /api/research/import
 * Admin only. Creates a new patent record pre-populated from a research candidate.
 * Also creates a patent_correspondence record (type: ai_research) with full candidate JSON.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

async function getAdminUser(token: string) {
  const anonClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService
    .from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

export async function POST(req: NextRequest) {
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getAdminUser(token)
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    run_id?:   string
    candidate?: {
      patent_number:        string
      title:                string
      assignee:             string | null
      filing_date:          string | null
      cpc_codes:            string[]
      technology_relevance: number
      acquisition_interest: number
      final_recommendation: string
      risk_flags:           string[]
      rationale:            string
      forward_citation_count: number | null
      abandonment_reason:   string | null
    }
  }

  const { run_id, candidate } = body
  if (!candidate?.patent_number || !candidate?.title) {
    return NextResponse.json({ error: 'candidate.patent_number and title are required' }, { status: 400 })
  }

  // ── Build description ────────────────────────────────────────────────────────
  const desc = [
    `Imported from patent research run. Original assignee: ${candidate.assignee ?? 'Unknown'}.`,
    candidate.filing_date ? `Filed: ${candidate.filing_date}.` : null,
    candidate.rationale   ? candidate.rationale                : null,
    candidate.abandonment_reason ? `Abandonment reason: ${candidate.abandonment_reason}.` : null,
  ].filter(Boolean).join(' ')

  // ── Notes JSON ───────────────────────────────────────────────────────────────
  const notes = JSON.stringify({
    source:               'autoresearch',
    run_id:               run_id ?? null,
    patent_number:        candidate.patent_number,
    cpc_codes:            candidate.cpc_codes ?? [],
    technology_relevance: candidate.technology_relevance,
    acquisition_interest: candidate.acquisition_interest,
    final_recommendation: candidate.final_recommendation,
    risk_flags:           candidate.risk_flags ?? [],
    forward_citation_count: candidate.forward_citation_count,
  }, null, 2)

  // ── Insert patent record ──────────────────────────────────────────────────────
  const { data: patent, error: patentErr } = await supabaseService
    .from('patents')
    .insert({
      owner_id:     user.id,
      title:        candidate.title,
      description:  desc,
      status:       'research_import',
      filing_status: 'draft',
      is_locked:    false,
      patent_number: candidate.patent_number,
      filing_date:  candidate.filing_date ?? null,
      // Store CPC codes in tags for discoverability
      tags:         candidate.cpc_codes?.length ? candidate.cpc_codes : null,
    })
    .select('id')
    .single()

  if (patentErr || !patent) {
    console.error('[research/import] patent insert error:', patentErr)
    return NextResponse.json({ error: 'Failed to create patent record' }, { status: 500 })
  }

  // ── Insert correspondence record ──────────────────────────────────────────────
  const corrContent = [
    `Patent Number: ${candidate.patent_number}`,
    `Title: ${candidate.title}`,
    `Original Assignee: ${candidate.assignee ?? 'Unknown'}`,
    `Filing Date: ${candidate.filing_date ?? 'Unknown'}`,
    `CPC Codes: ${(candidate.cpc_codes ?? []).join(', ') || 'None'}`,
    ``,
    `Gemini Assessment:`,
    `  Technology Relevance: ${candidate.technology_relevance}/10`,
    `  Acquisition Interest: ${candidate.acquisition_interest}/10`,
    `  Recommendation: ${candidate.final_recommendation}`,
    ``,
    `Rationale: ${candidate.rationale}`,
    ``,
    `Risk Flags:`,
    ...(candidate.risk_flags ?? []).map(f => `  - ${f}`),
    ``,
    `Abandonment Reason: ${candidate.abandonment_reason ?? 'Not specified'}`,
    `Forward Citations: ${candidate.forward_citation_count ?? 'Unknown'}`,
    ``,
    `Source Run: ${run_id ?? 'Unknown'}`,
    `Imported: ${new Date().toISOString()}`,
  ].join('\n')

  const { error: corrErr } = await supabaseService
    .from('patent_correspondence')
    .insert({
      patent_id:           patent.id,
      owner_id:            user.id,
      title:               `Research Import — ${candidate.patent_number} via Autoresearch`,
      type:                'ai_research',
      correspondence_date: new Date().toISOString().split('T')[0],
      content:             corrContent,
      from_party:          'BoClaw Autoresearch',
      tags:                ['research-import', 'autoresearch'],
    })

  if (corrErr) {
    // Non-fatal — patent was created, correspondence failed
    console.warn('[research/import] correspondence insert error:', corrErr)
  }

  return NextResponse.json({
    patent_id:   patent.id,
    patent_url:  `/dashboard/patents/${patent.id}`,
  })
}
