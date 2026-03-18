/**
 * POST /api/patents/[id]/ids-candidates/generate-draft
 * Filters candidates where status = 'include', formats an IDS draft as plain text,
 * saves to patent_correspondence, returns the correspondence record.
 *
 * PTO/SB/08 is XFA — never auto-fill. This generates formatted plaintext for manual paste.
 *
 * No module-level Supabase client. (Standing rule.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function makeClients(token: string) {
  const svc = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
  )
  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  return { svc, userClient }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  } catch { return iso }
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { svc, userClient } = makeClients(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership + pull patent metadata for header
  const { data: patent } = await svc
    .from('patents')
    .select('owner_id, title, provisional_app_number, application_number')
    .eq('id', patentId)
    .single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch assignee from patent_profiles
  const { data: profile } = await svc
    .from('patent_profiles')
    .select('full_name, default_assignee_name')
    .eq('id', user.id)
    .single()

  const assignee = profile?.default_assignee_name ?? profile?.full_name ?? 'Applicant'
  const appNumber = patent.application_number ?? patent.provisional_app_number ?? '[App # TBD]'

  // Fetch all 'include' candidates
  const { data: candidates, error: candErr } = await svc
    .from('research_ids_candidates')
    .select('*')
    .eq('patent_id', patentId)
    .eq('status', 'include')
    .order('filing_date', { ascending: true })

  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 })
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: 'No candidates marked "include"' }, { status: 400 })
  }

  // Format the IDS draft as plaintext
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

  // Table columns
  const COL_REF  = 25
  const COL_TITLE = 40
  const COL_INV  = 25
  const COL_DATE = 12

  const tableHeader =
    padRight('Reference No.',    COL_REF) + ' | ' +
    padRight('Title',            COL_TITLE) + ' | ' +
    padRight('Inventor(s)',      COL_INV) + ' | ' +
    'Filing Date'

  const tableSep = '-'.repeat(COL_REF) + '-+-' +
    '-'.repeat(COL_TITLE) + '-+-' +
    '-'.repeat(COL_INV)  + '-+-' +
    '-'.repeat(COL_DATE)

  const tableRows = candidates.map(c => {
    const ref    = c.application_number ?? c.patent_number ?? '—'
    const title  = (c.title ?? '—').slice(0, COL_TITLE - 1)
    const inv    = (c.inventor_names ?? []).join(', ').slice(0, COL_INV - 1) || '—'
    const date   = formatDate(c.filing_date)
    return padRight(ref, COL_REF) + ' | ' + padRight(title, COL_TITLE) + ' | ' + padRight(inv, COL_INV) + ' | ' + date
  }).join('\n')

  const relevanceSection = candidates
    .filter(c => c.relevance_notes)
    .map(c => `${c.application_number ?? c.patent_number ?? c.title}: ${c.relevance_notes}`)
    .join('\n')

  const idsDraft = [
    'INFORMATION DISCLOSURE STATEMENT',
    `Patent Application: ${appNumber}`,
    `Applicant: ${assignee}`,
    `Date: ${today}`,
    '',
    '═'.repeat(60),
    'U.S. PATENT APPLICATIONS',
    '═'.repeat(60),
    '',
    tableHeader,
    tableSep,
    tableRows,
    '',
    ...(relevanceSection ? [
      '═'.repeat(60),
      'RELEVANCE NOTES',
      '═'.repeat(60),
      '',
      relevanceSection,
      '',
    ] : []),
    '═'.repeat(60),
    'IMPORTANT: This is a formatted draft for review only.',
    'File the official IDS using USPTO Patent Center.',
    'PTO/SB/08 form must be submitted directly — do not paste this text into the XFA form.',
    '═'.repeat(60),
  ].join('\n')

  // Save to patent_correspondence
  const { data: corrRecord, error: corrErr } = await svc
    .from('patent_correspondence')
    .insert({
      patent_id:           patentId,
      owner_id:            user.id,
      title:               `IDS Candidates — ${today}`,
      type:                'ids_draft',
      content:             idsDraft,
      from_party:          'PatentPending AI',
      correspondence_date: new Date().toISOString().split('T')[0],
      tags:                ['ids', 'prior_art', 'ids_draft'],
      attachments: {
        candidate_count: candidates.length,
        generated_at:   new Date().toISOString(),
        app_number:     appNumber,
      },
    })
    .select()
    .single()

  if (corrErr) return NextResponse.json({ error: corrErr.message }, { status: 500 })

  return NextResponse.json({
    ok:           true,
    draft:        idsDraft,
    candidate_count: candidates.length,
    correspondence_id: corrRecord.id,
    message:      'IDS draft saved to Correspondence',
  })
}
