/**
 * POST /api/patents/[id]/oath-declaration
 *
 * Generates a pre-filled PTO/AIA/01 Oath & Declaration PDF using pdf-lib.
 * Pre-fills from patent_profiles + patent record.
 * User signs (typed /Name/) and downloads.
 *
 * This is a flat PDF — not a fillable form.
 * USPTO accepts flat PDFs with typed /Name/ signatures (37 CFR 1.4(d)(2)).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sanitizeForPdf } from '@/lib/pdf-sanitize'

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

// Page geometry (Letter)
const PAGE_W     = 612
const PAGE_H     = 792
const MARGIN_X   = 54
const MARGIN_TOP = 54
const CONTENT_W  = PAGE_W - MARGIN_X * 2

function toY(y: number) { return PAGE_H - MARGIN_TOP - y }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  try {
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user } } = await getUserClient(token).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Body: optional typed signature override
    let body: { signature?: string } = {}
    try { body = await req.json() } catch { /* default */ }

    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, owner_id, title, inventors, provisional_app_number, provisional_number, filing_date, provisional_filed_at')
      .eq('id', patentId)
      .single()

    if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
    if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: profile } = await supabaseService
      .from('patent_profiles')
      .select('name_first, name_middle, name_last, address_line_1, city, state, zip, country, email')
      .eq('id', user.id)
      .single()

    // Extract + sanitize
    const title        = sanitizeForPdf((patent.title as string) ?? '')
    const appNumber    = sanitizeForPdf((patent.provisional_app_number as string) ?? (patent.provisional_number as string) ?? '')
    const filedAt      = (patent.provisional_filed_at as string) ?? (patent.filing_date as string) ?? ''
    const filedDateFmt = filedAt
      ? new Date(filedAt + (filedAt.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      : ''
    const inventors     = (patent.inventors as string[]) ?? []
    const firstName     = sanitizeForPdf((profile?.name_first as string) ?? '')
    const middleName    = sanitizeForPdf((profile?.name_middle as string) ?? '')
    const lastName      = sanitizeForPdf((profile?.name_last as string) ?? '')
    const inventorName  = [firstName, middleName, lastName].filter(Boolean).join(' ') || sanitizeForPdf(inventors[0] ?? '')
    const address1      = sanitizeForPdf((profile?.address_line_1 as string) ?? '')
    const city          = sanitizeForPdf((profile?.city as string) ?? '')
    const state         = sanitizeForPdf((profile?.state as string) ?? '')
    const zip           = sanitizeForPdf((profile?.zip as string) ?? '')
    const country       = sanitizeForPdf((profile?.country as string) ?? 'US')
    const signature     = sanitizeForPdf(body.signature ?? `/${inventorName}/`)
    const today         = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    const todayLong     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    // Build PDF
    const doc = await PDFDocument.create()
    doc.setTitle(sanitizeForPdf(`Oath and Declaration -- ${title}`))
    doc.setProducer('PatentPending.app')
    doc.setSubject('Inventor Declaration 37 CFR 1.63 / PTO/AIA/01')

    const page = doc.addPage([PAGE_W, PAGE_H])
    const [bold, regular, italic] = await Promise.all([
      doc.embedFont(StandardFonts.HelveticaBold),
      doc.embedFont(StandardFonts.Helvetica),
      doc.embedFont(StandardFonts.HelveticaOblique),
    ])

    function drawText(text: string, x: number, yTop: number, opts: {
      size?: number; font?: typeof regular; color?: [number, number, number]; maxWidth?: number
    } = {}) {
      const size = opts.size ?? 9
      const font = opts.font ?? regular
      const [r, g, b] = opts.color ?? [0, 0, 0]
      let str = sanitizeForPdf(text)
      if (opts.maxWidth && font.widthOfTextAtSize(str, size) > opts.maxWidth) {
        while (str.length > 0 && font.widthOfTextAtSize(str + '...', size) > opts.maxWidth) str = str.slice(0, -1)
        str += '...'
      }
      page.drawText(str, { x: MARGIN_X + x, y: toY(yTop), size, font, color: rgb(r, g, b) })
    }

    function drawHRule(x1: number, x2: number, yTop: number, thickness = 0.5) {
      page.drawLine({
        start: { x: MARGIN_X + x1, y: toY(yTop) },
        end:   { x: MARGIN_X + x2, y: toY(yTop) },
        thickness, color: rgb(0.3, 0.3, 0.3),
      })
    }

    function sectionBar(text: string, yTop: number) {
      page.drawRectangle({ x: MARGIN_X, y: toY(yTop + 14), width: CONTENT_W, height: 14, color: rgb(0.12, 0.14, 0.22) })
      drawText(text, 6, yTop + 2, { size: 8, font: bold, color: [1, 1, 1] })
    }

    function field(label: string, value: string, x: number, w: number, yTop: number) {
      drawText(label.toUpperCase(), x, yTop, { size: 6.5, font: bold, color: [0.4, 0.4, 0.4] })
      drawText(value, x, yTop + 10, { size: 9, font: regular, maxWidth: w - 4 })
      drawHRule(x, x + w, yTop + 11)
    }

    let y = 0

    // ── Header ──────────────────────────────────────────────────────────────────
    drawText('UNITED STATES PATENT AND TRADEMARK OFFICE', 0, y + 8, { size: 7.5, font: bold, color: [0.12, 0.14, 0.22] })
    y += 14
    drawText('DECLARATION FOR UTILITY OR DESIGN PATENT APPLICATION', 0, y + 9, { size: 11, font: bold })
    y += 14
    drawText('37 CFR 1.63  -  Form PTO/AIA/01', 0, y + 3, { size: 7, font: italic, color: [0.4, 0.4, 0.4] })
    y += 10
    drawHRule(0, CONTENT_W, y, 1.5)
    y += 5
    drawText(`Generated ${todayLong} by PatentPending.app`, 0, y, { size: 6.5, font: italic, color: [0.5, 0.5, 0.5] })
    drawText('(!) DRAFT -- Review before signing', 300, y, { size: 6.5, font: bold, color: [0.7, 0.4, 0] })
    y += 14

    // ── Section 1: Declaration Statement ────────────────────────────────────────
    sectionBar('1. DECLARATION STATEMENT', y)
    y += 18

    const DECL_LINES = [
      'The below-named inventor hereby declares that:',
      '',
      '(1) The inventor is the original inventor or an original joint inventor of the claimed invention',
      '    in the application identified below.',
      '',
      '(2) The inventor has reviewed and understands the contents of the application, including the',
      '    claims, as amended by any amendment specifically referred to in this declaration.',
      '',
      '(3) The inventor acknowledges the duty to disclose information which is material to patentability',
      '    as defined in 37 CFR 1.56.',
      '',
      '(4) The inventor hereby declares that all statements made herein of the inventor\'s own knowledge',
      '    are true and that all statements made on information and belief are believed to be true.',
      '',
      'WARNING: Any willful false statement made in this declaration is punishable under 18 U.S.C. 1001',
      'by fine or imprisonment of not more than 5 years, or both.',
    ]

    for (const line of DECL_LINES) {
      drawText(line, 0, y, { size: 8, font: line.includes('WARNING') ? bold : regular })
      y += line === '' ? 5 : 11
    }
    y += 6

    // ── Section 2: Application Information ──────────────────────────────────────
    sectionBar('2. APPLICATION INFORMATION', y)
    y += 18

    field('Title of Invention', title, 0, CONTENT_W, y)
    y += 18
    field('Application Number', appNumber || '(assign upon filing)', 0, 240, y)
    field('Filing Date', filedDateFmt || '(to be assigned)', 246, CONTENT_W - 246, y)
    y += 18

    // ── Section 3: Inventor Information ─────────────────────────────────────────
    sectionBar('3. INVENTOR INFORMATION', y)
    y += 18

    const thirdW = (CONTENT_W - 12) / 3
    field('Given Name', firstName, 0,            thirdW, y)
    field('Middle Name', middleName, thirdW + 6,  thirdW, y)
    field('Family Name', lastName,   (thirdW + 6) * 2, thirdW, y)
    y += 18
    field('Mailing Address', address1, 0, CONTENT_W / 2, y)
    field('City', city, CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
    y += 18
    field('State', state, 0, thirdW, y)
    field('Postal Code', zip, thirdW + 6, thirdW, y)
    field('Country of Citizenship', country, (thirdW + 6) * 2, thirdW, y)
    y += 22

    // ── Section 4: Signature ─────────────────────────────────────────────────────
    sectionBar('4. SIGNATURE', y)
    y += 18

    drawText('The inventor hereby signs this declaration under 37 CFR 1.4(d)(2).', 0, y, {
      size: 7.5, font: italic, color: [0.4, 0.4, 0.4],
    })
    y += 13
    drawText('A typed /Name/ signature constitutes an S-signature and is legally equivalent to a handwritten signature.', 0, y, {
      size: 7, font: italic, color: [0.5, 0.5, 0.5],
    })
    y += 16

    field('Inventor Signature (typed)', signature, 0, CONTENT_W / 2, y)
    field('Date', today, CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
    y += 18
    field('Printed Name', inventorName, 0, CONTENT_W / 2, y)
    field('Registration No. (Attorney/Agent only)', 'N/A -- Pro Se Filer', CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
    y += 22

    // ── Section 5: Power of Attorney ─────────────────────────────────────────────
    sectionBar('5. POWER OF ATTORNEY (optional)', y)
    y += 18
    drawText('Power of attorney is not being granted at this time (Pro Se filing).', 0, y, {
      size: 8.5, font: regular, color: [0.4, 0.4, 0.4],
    })
    y += 22

    // ── Footer ──────────────────────────────────────────────────────────────────
    drawHRule(0, CONTENT_W, y, 0.5)
    y += 6
    drawText(`Form PTO/AIA/01  -  Generated by PatentPending.app  -  ${todayLong}`, 0, y, {
      size: 6.5, font: regular, color: [0.5, 0.5, 0.5],
    })
    drawText('File at patentcenter.uspto.gov  -  PatentPending.app is not a law firm.', 0, y + 9, {
      size: 6.5, font: regular, color: [0.5, 0.5, 0.5],
    })

    const pdfBytes  = await doc.save()
    const pdfBuffer = Buffer.from(pdfBytes)
    const filename  = `oath-declaration-${patentId.slice(0, 8)}.pdf`

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(pdfBuffer.byteLength),
        'Cache-Control':       'no-store',
      },
    })

  } catch (error) {
    console.error('[oath-declaration] error:', error)
    return NextResponse.json({
      error: `Failed to generate declaration: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }, { status: 500 })
  }
}
