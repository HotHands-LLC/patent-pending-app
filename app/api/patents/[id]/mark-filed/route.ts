import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/** Loosely validate USPTO provisional application number formats:
 *  - New (post-2012): 63/123,456 or 63/123456
 *  - Legacy: 60/123,456 or 61/123,456 or 62/123,456
 *  - Non-provisional: 17/123,456 etc.
 *  Just requires non-empty string ≤ 20 chars with at least some digits.
 */
function isValidAppNumber(s: string): boolean {
  if (!s || s.trim().length === 0) return false
  if (s.trim().length > 20) return false
  return /\d/.test(s) // must contain at least one digit
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  try {
    // ── Auth ────────────────────────────────────────────────────────────────────
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user } } = await getUserClient(token).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── Parse body ──────────────────────────────────────────────────────────────
    let body: {
      app_number?: string
      filed_at?: string
      receipt_file?: string    // base64-encoded PDF
      receipt_filename?: string
    } = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { app_number, filed_at, receipt_file, receipt_filename } = body

    // ── Validate ────────────────────────────────────────────────────────────────
    if (!app_number || !isValidAppNumber(app_number)) {
      return NextResponse.json({
        error: 'app_number is required and must be a valid application number (e.g. 63/123,456)',
        code: 'INVALID_APP_NUMBER',
      }, { status: 400 })
    }

    const filedDate = filed_at ? new Date(filed_at) : new Date()
    if (isNaN(filedDate.getTime())) {
      return NextResponse.json({ error: 'filed_at must be a valid ISO date string' }, { status: 400 })
    }
    // Sanity: filing date can't be more than 1 day in the future
    // (allow same-day filings where timezone offset might push date slightly ahead)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (filedDate > tomorrow) {
      return NextResponse.json({
        error: 'filed_at cannot be in the future',
        code: 'FUTURE_DATE',
      }, { status: 400 })
    }

    // ── Fetch patent — verify ownership ─────────────────────────────────────────
    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, owner_id, title, filing_status')
      .eq('id', patentId)
      .single()

    if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
    if (patent.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden — only the patent owner can mark it as filed' }, { status: 403 })
    }

    // ── Compute 12-month non-provisional deadline ────────────────────────────────
    const nonprovDeadline = new Date(filedDate)
    nonprovDeadline.setFullYear(nonprovDeadline.getFullYear() + 1)
    // Technically 12 calendar months from filing date — subtract 1 day for safety margin
    // (USPTO counts from filing date — if filed Jan 15 2025, deadline is Jan 15 2026)

    // ── Optional: upload filing receipt PDF to Supabase Storage ─────────────────
    let receiptUrl: string | null = null

    if (receipt_file) {
      try {
        const fileBuffer = Buffer.from(receipt_file, 'base64')
        const ext = receipt_filename?.endsWith('.pdf') ? 'pdf' : 'pdf'
        const storagePath = `${patentId}/filing-receipt.${ext}`

        const { error: uploadError } = await supabaseService.storage
          .from('patent-uploads')
          .upload(storagePath, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          })

        if (uploadError) {
          console.error('[mark-filed] receipt upload error:', uploadError.message)
          // Don't fail the whole request — just skip the receipt URL
        } else {
          const { data: signedData } = await supabaseService.storage
            .from('patent-uploads')
            .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1-year signed URL

          receiptUrl = signedData?.signedUrl ?? null
        }
      } catch (e) {
        console.error('[mark-filed] receipt processing error:', e)
        // Non-fatal — proceed without receipt URL
      }
    }

    // ── Update patent record ─────────────────────────────────────────────────────
    const updates: Record<string, unknown> = {
      provisional_app_number: app_number.trim(),
      provisional_filed_at:   filedDate.toISOString(),
      provisional_filed_by:   user.id,
      nonprov_deadline_at:    nonprovDeadline.toISOString(),
      filing_status:          'provisional_filed',
      updated_at:             new Date().toISOString(),
    }
    if (receiptUrl) {
      updates.filing_receipt_url = receiptUrl
    }

    const { data: updated, error: updateError } = await supabaseService
      .from('patents')
      .update(updates)
      .eq('id', patentId)
      .select('id, title, provisional_app_number, provisional_filed_at, nonprov_deadline_at, filing_status, filing_receipt_url')
      .single()

    if (updateError) {
      console.error('[mark-filed] update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to update patent record' }, { status: 500 })
    }

    console.log(`[mark-filed] patent=${patentId} app_number=${app_number} filed=${filedDate.toISOString()} nonprov_deadline=${nonprovDeadline.toISOString()}`)

    return NextResponse.json({
      ok: true,
      patent: updated,
      message: `Patent marked as filed. Non-provisional deadline: ${nonprovDeadline.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    })

  } catch (error) {
    console.error('[mark-filed] unhandled error:', error)
    return NextResponse.json({
      error: `Failed to mark patent as filed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      code: 'MARK_FILED_ERROR',
    }, { status: 500 })
  }
}
