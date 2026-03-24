/**
 * POST /api/admin/research/import
 * Admin-only. Creates a draft patent record from a cached research_result.
 * Marks the result as imported and links patent_id.
 *
 * Body: { resultId: string }
 * Returns: { patentId: string, patentUrl: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
)

async function getAdminUser(token: string) {
  const anonClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
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

  const body = await req.json().catch(() => ({})) as { resultId?: string }
  if (!body.resultId) {
    return NextResponse.json({ error: 'resultId is required' }, { status: 400 })
  }

  // Load the cached result
  const { data: result, error: fetchErr } = await supabaseService
    .from('research_results')
    .select('*')
    .eq('id', body.resultId)
    .single()

  if (fetchErr || !result) {
    return NextResponse.json({ error: 'Research result not found' }, { status: 404 })
  }

  if (result.imported_to_marketplace) {
    return NextResponse.json({
      error: 'Already imported',
      patentId:  result.imported_patent_id,
      patentUrl: `/dashboard/patents/${result.imported_patent_id}`,
    }, { status: 409 })
  }

  // Build description from available fields
  const descParts: string[] = [
    'Imported via Autoresearch (USPTO ODP).',
    result.assignee ? `Original assignee: ${result.assignee}.` : null,
    result.filing_date ? `Filed: ${result.filing_date}.` : null,
    result.abandonment_reason ? `Abandonment reason: ${result.abandonment_reason}.` : null,
    result.desjardins_flag
      ? '⚡ Desjardins revival candidate — abandoned for §101 before Nov 4 2025. May be eligible for re-examination under new USPTO guidance.'
      : null,
  ].filter(Boolean) as string[]

  const description = descParts.join(' ')

  // Create draft patent record — always marketplace_enabled: false, status: research_import
  const { data: patent, error: patentErr } = await supabaseService
    .from('patents')
    .insert({
      owner_id:          user.id,
      title:             result.title.slice(0, 255),
      description,
      status:            'research_import',
      filing_status:     'draft',
      is_locked:         false,
      marketplace_enabled: false,
      patent_number:     result.patent_number ?? null,
      provisional_app_number: result.application_number ?? null,
      filing_date:       result.filing_date ?? null,
      tags:              result.cpc_codes?.length ? result.cpc_codes.slice(0, 5) : null,
      ip_readiness_score: result.readiness_score ?? null,
    })
    .select('id')
    .single()

  if (patentErr || !patent) {
    console.error('[research/import] patent insert error:', patentErr)
    return NextResponse.json({ error: 'Failed to create patent record' }, { status: 500 })
  }

  // Add correspondence note
  await supabaseService
    .from('patent_correspondence')
    .insert({
      patent_id:           patent.id,
      owner_id:            user.id,
      title:               `Autoresearch Import — ${result.patent_number ?? result.application_number ?? 'Unknown'}`,
      type:                'ai_research',
      correspondence_date: new Date().toISOString().split('T')[0],
      content: [
        `Patent Number: ${result.patent_number ?? 'N/A'}`,
        `Application Number: ${result.application_number ?? 'N/A'}`,
        `Title: ${result.title}`,
        `Filed: ${result.filing_date ?? 'Unknown'}`,
        `Assignee: ${result.assignee ?? 'Unknown'}`,
        `CPC Codes: ${(result.cpc_codes ?? []).join(', ') || 'None'}`,
        `Readiness Score: ${result.readiness_score ?? 0}/100`,
        `Desjardins Flag: ${result.desjardins_flag ? 'YES — Revival Candidate' : 'No'}`,
        `Abandonment Reason: ${result.abandonment_reason ?? 'N/A'}`,
        `Abandonment Date: ${result.abandonment_date ?? 'N/A'}`,
        `Source: ${result.source ?? 'uspto_odp'}`,
        `Imported: ${new Date().toISOString()}`,
      ].join('\n'),
      from_party: 'PatentClaw Autoresearch',
      tags:       ['autoresearch', 'research-import', result.desjardins_flag ? 'desjardins-candidate' : null].filter(Boolean),
    })

  // Mark result as imported
  await supabaseService
    .from('research_results')
    .update({
      imported_to_marketplace: true,
      imported_patent_id:      patent.id,
    })
    .eq('id', body.resultId)

  return NextResponse.json({
    patentId:  patent.id,
    patentUrl: `/dashboard/patents/${patent.id}`,
  })
}
