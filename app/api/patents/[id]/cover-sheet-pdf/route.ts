import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildCoverSheetPdf } from '@/lib/cover-sheet-pdf'
import { getUserTierInfo, isPro } from '@/lib/tier'

export const maxDuration = 30

// GET /api/patents/[id]/cover-sheet-pdf
// Returns the USPTO ADS cover sheet as a downloadable PDF 1.7.
// Auth-gated: patent must belong to requesting user.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Fetch patent ───────────────────────────────────────────────────────────
  const { data: patent } = await serviceClient
    .from('patents')
    .select('id, owner_id, title, inventors, provisional_number, application_number, filing_date, spec_draft, claims_draft, entity_status, provisional_app_number, provisional_filed_at')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Tier gate — export requires Pro ───────────────────────────────────────
  const tierInfo = await getUserTierInfo(user.id)
  if (!isPro(tierInfo, { isOwner: true, feature: 'cover_sheet_export' })) {
    return NextResponse.json({
      error: 'Export requires Pattie Pro.',
      code: 'TIER_REQUIRED',
      requiredTier: 'pro',
      feature: 'cover_sheet_export',
    }, { status: 403 })
  }

  // ── Fetch user profile ─────────────────────────────────────────────────────
  const { data: profile } = await serviceClient
    .from('patent_profiles')
    .select('name_first, name_middle, name_last, address_line_1, city, state, zip, country, phone, email, uspto_customer_number, default_assignee_name, default_assignee_address')
    .eq('id', user.id)
    .single()

  // ── Build PDF ──────────────────────────────────────────────────────────────
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await buildCoverSheetPdf(
      patent as Record<string, unknown>,
      profile as Record<string, unknown> | null
    )
  } catch (err) {
    console.error('[cover-sheet-pdf] PDF build error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }

  const slug = (patent.title as string ?? 'patent')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const filename = `${slug}-cover-sheet.pdf`

  const pdfBuffer = pdfBytes.buffer as ArrayBuffer
  return new Response(new Blob([pdfBuffer], { type: 'application/pdf' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
