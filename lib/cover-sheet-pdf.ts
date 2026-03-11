// lib/cover-sheet-pdf.ts
// USPTO Application Data Sheet (ADS) — server-side PDF generator
// Uses pdf-lib (pure JS, no native deps, Vercel-compatible)
// Output: PDF 1.7 compliant — USPTO accepts PDF 1.4–1.7

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import { USPTO_FEES } from '@/lib/uspto-fees'
import { sanitizeForPdf } from '@/lib/pdf-sanitize'

// ── Page constants ────────────────────────────────────────────────────────────
const PTS_PER_INCH = 72
const PAGE_W = 8.5 * PTS_PER_INCH   // 612
const PAGE_H = 11 * PTS_PER_INCH    // 792
const MARGIN_X = 0.75 * PTS_PER_INCH  // 54pt
const MARGIN_TOP = 0.75 * PTS_PER_INCH
const MARGIN_BOT = 0.75 * PTS_PER_INCH
const CONTENT_W = PAGE_W - MARGIN_X * 2  // 468pt

// ── Drawing helpers ───────────────────────────────────────────────────────────

interface DrawCtx {
  page: PDFPage
  y: number  // current Y position (from top — we convert to pdf-lib bottom-origin)
  bold: PDFFont
  regular: PDFFont
  italic: PDFFont
}

function toY(ctx: DrawCtx, offsetFromTop: number) {
  return PAGE_H - MARGIN_TOP - offsetFromTop
}

function drawText(ctx: DrawCtx, text: string, x: number, yTop: number, opts: {
  size?: number; font?: PDFFont; color?: [number,number,number]; maxWidth?: number
} = {}) {
  const size = opts.size ?? 10
  const font = opts.font ?? ctx.regular
  const [r, g, b] = opts.color ?? [0, 0, 0]
  const y = toY(ctx, yTop)

  // ── WinAnsi safety: sanitize ALL text before touching pdf-lib ────────────────
  // StandardFonts (Helvetica, etc.) use WinAnsiEncoding (codepoints 0–255 only).
  // Any character outside that range throws: WinAnsi cannot encode "X" (0xNNNN)
  // sanitizeForPdf maps common symbols to ASCII and strips the rest.
  let str = sanitizeForPdf(text)

  // Truncate to maxWidth — use '...' not '…' (U+2026 is also non-WinAnsi)
  if (opts.maxWidth && font.widthOfTextAtSize(str, size) > opts.maxWidth) {
    while (str.length > 0 && font.widthOfTextAtSize(str + '...', size) > opts.maxWidth) {
      str = str.slice(0, -1)
    }
    str = str + '...'
  }

  ctx.page.drawText(str, {
    x: MARGIN_X + x,
    y,
    size,
    font,
    color: rgb(r, g, b),
  })
}

function drawLine(ctx: DrawCtx, x1: number, x2: number, yTop: number, thickness = 0.5) {
  ctx.page.drawLine({
    start: { x: MARGIN_X + x1, y: toY(ctx, yTop) },
    end: { x: MARGIN_X + x2, y: toY(ctx, yTop) },
    thickness,
    color: rgb(0.3, 0.3, 0.3),
  })
}

function drawBox(ctx: DrawCtx, x: number, w: number, yTop: number, h: number) {
  ctx.page.drawRectangle({
    x: MARGIN_X + x,
    y: toY(ctx, yTop + h),
    width: w,
    height: h,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 0.5,
    color: rgb(0.97, 0.97, 0.97),
  })
}

function sectionHeader(ctx: DrawCtx, text: string, yTop: number) {
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: toY(ctx, yTop + 14),
    width: CONTENT_W,
    height: 14,
    color: rgb(0.12, 0.14, 0.22),
  })
  // drawText applies sanitizeForPdf internally
  drawText(ctx, text, 4, yTop + 1, { size: 8, font: ctx.bold, color: [1, 1, 1] })
}

function labeledField(ctx: DrawCtx, label: string, value: string, x: number, w: number, yTop: number) {
  // drawText applies sanitizeForPdf internally — label and value both covered
  drawText(ctx, label.toUpperCase(), x, yTop, { size: 6.5, font: ctx.bold, color: [0.4, 0.4, 0.4] })
  drawText(ctx, value, x, yTop + 11, { size: 9, font: ctx.regular, maxWidth: w - 4 })
  drawLine(ctx, x, x + w, yTop + 12)
}

function checkbox(ctx: DrawCtx, checked: boolean, x: number, yTop: number) {
  ctx.page.drawRectangle({
    x: MARGIN_X + x, y: toY(ctx, yTop + 8), width: 8, height: 8,
    borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.5,
    color: checked ? rgb(0.12, 0.14, 0.22) : rgb(1, 1, 1),
  })
  if (checked) {
    // 'X' is WinAnsi-safe (codepoint 88); drawText also sanitizes as backup
    drawText(ctx, 'X', x + 1, yTop + 1, { size: 7, font: ctx.bold, color: [1, 1, 1] })
  }
}

// ── Main PDF builder ──────────────────────────────────────────────────────────

export async function buildCoverSheetPdf(
  patent: Record<string, unknown>,
  profile: Record<string, unknown> | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setProducer('PatentPending.app')
  doc.setCreator('PatentPending.app -- patentpending.app')
  doc.setTitle(sanitizeForPdf(`ADS Cover Sheet -- ${patent.title ?? 'Patent Application'}`))
  doc.setSubject('USPTO Application Data Sheet (37 CFR 1.76)')
  doc.setKeywords(['patent', 'USPTO', 'ADS', 'provisional'])

  const page = doc.addPage([PAGE_W, PAGE_H])

  const [bold, regular, italic] = await Promise.all([
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaOblique),
  ])

  const ctx: DrawCtx = { page, y: 0, bold, regular, italic }

  // ── Extract + sanitize data ──────────────────────────────────────────────────
  // sanitizeForPdf applied here as a first pass so downstream interpolations are safe.
  // drawText also calls sanitizeForPdf internally as a final safety net.
  const title         = sanitizeForPdf((patent.title as string) ?? '')
  const provisionalNum = sanitizeForPdf((patent.provisional_number as string) ?? '')
  const filingDate    = (patent.filing_date as string) ?? ''
  const inventors     = (patent.inventors as string[]) ?? []

  const firstName   = sanitizeForPdf((profile?.name_first as string) ?? '')
  const middleName  = sanitizeForPdf((profile?.name_middle as string) ?? '')
  const lastName    = sanitizeForPdf((profile?.name_last as string) ?? '')
  const fullName    = [firstName, middleName, lastName].filter(Boolean).join(' ')
  const inventorName = fullName || sanitizeForPdf(inventors[0] ?? '')

  const address1    = sanitizeForPdf((profile?.address_line_1 as string) ?? '')
  const city        = sanitizeForPdf((profile?.city as string) ?? '')
  const state       = sanitizeForPdf((profile?.state as string) ?? '')
  const zip         = sanitizeForPdf((profile?.zip as string) ?? '')
  const country     = sanitizeForPdf((profile?.country as string) ?? 'US')
  const phone       = sanitizeForPdf((profile?.phone as string) ?? '')
  const email       = sanitizeForPdf((profile?.email as string) ?? '')
  const customerNum = sanitizeForPdf((profile?.uspto_customer_number as string) ?? '')
  const assigneeName = sanitizeForPdf((profile?.default_assignee_name as string) ?? '')
  const assigneeAddr = sanitizeForPdf((profile?.default_assignee_address as string) ?? '')
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const todayLong = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const signature = `/${inventorName}/`

  // ── Header ──────────────────────────────────────────────────────────────────
  let y = 0

  drawText(ctx, 'UNITED STATES PATENT AND TRADEMARK OFFICE', 0, y + 10, {
    size: 9, font: bold, color: [0.12, 0.14, 0.22]
  })
  y += 16
  drawText(ctx, 'APPLICATION DATA SHEET', 40, y + 8, { size: 14, font: bold })
  y += 18
  drawText(ctx, '37 CFR 1.76', 96, y + 2, { size: 9, font: regular, color: [0.4, 0.4, 0.4] })
  y += 12
  drawLine(ctx, 0, CONTENT_W, y, 1.5)
  y += 6
  drawText(ctx, `Generated ${todayLong} by PatentPending.app  -  File at patentcenter.uspto.gov`, 0, y, {
    size: 7, font: italic, color: [0.5, 0.5, 0.5]
  })
  // ⚠ was U+26A0 — replaced with ASCII '(!) DRAFT' to avoid WinAnsi crash
  drawText(ctx, '(!) DRAFT -- Review all fields before filing', 300, y, {
    size: 7, font: bold, color: [0.7, 0.4, 0]
  })
  y += 16

  // ── Section 1: Application Information ──────────────────────────────────────
  sectionHeader(ctx, '1. APPLICATION INFORMATION', y)
  y += 20
  labeledField(ctx, 'Title of Invention', title, 0, CONTENT_W, y)
  y += 24
  labeledField(ctx, 'Application Number', 'Assigned by USPTO upon filing', 0, 200, y)
  labeledField(ctx, 'Filing Date', 'Assigned by USPTO', 210, 140, y)
  labeledField(ctx, 'Customer Number', customerNum || '--', 360, CONTENT_W - 360, y)
  y += 24
  labeledField(ctx, 'Attorney Docket Number', '(optional)', 0, 200, y)
  y += 28

  // ── Section 2: Inventor Information ─────────────────────────────────────────
  sectionHeader(ctx, '2. INVENTOR INFORMATION', y)
  y += 20
  drawText(ctx, 'Inventor 1 -- First Named Inventor', 0, y, { size: 7.5, font: bold, color: [0.3, 0.3, 0.3] })
  y += 12
  const third = (CONTENT_W - 8) / 3
  labeledField(ctx, 'Given Name', firstName, 0, third, y)
  labeledField(ctx, 'Middle Name', middleName, third + 4, third, y)
  labeledField(ctx, 'Family Name', lastName, (third + 4) * 2, third, y)
  y += 24
  labeledField(ctx, 'Street Address', address1, 0, CONTENT_W / 2, y)
  labeledField(ctx, 'City', city, CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
  y += 24
  const q = (CONTENT_W - 8) / 3
  labeledField(ctx, 'State', state, 0, q, y)
  labeledField(ctx, 'Postal Code', zip, q + 4, q, y)
  labeledField(ctx, 'Country', country, (q + 4) * 2, q, y)
  y += 24
  labeledField(ctx, 'Telephone', phone, 0, CONTENT_W / 2, y)
  labeledField(ctx, 'Email', email, CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
  y += 24
  labeledField(ctx, 'Citizenship', 'United States', 0, CONTENT_W / 2, y)
  y += 28

  // ── Section 3: Correspondence Information ────────────────────────────────────
  sectionHeader(ctx, '3. CORRESPONDENCE INFORMATION', y)
  y += 20
  labeledField(ctx, 'Given Name', firstName, 0, CONTENT_W / 2, y)
  labeledField(ctx, 'Family Name', lastName, CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
  y += 24
  labeledField(ctx, 'Organization / Firm Name', 'Pro Se (self-represented)', 0, CONTENT_W, y)
  y += 24
  labeledField(ctx, 'Street Address', address1, 0, CONTENT_W, y)
  y += 24
  labeledField(ctx, 'City', city, 0, CONTENT_W / 2, y)
  labeledField(ctx, 'State', state, CONTENT_W / 2 + 4, q, y)
  labeledField(ctx, 'Postal Code', zip, CONTENT_W / 2 + 4 + q + 4, q - 4, y)
  y += 28

  // ── Section 4: Application Type / Entity Status ──────────────────────────────
  sectionHeader(ctx, '4. APPLICATION TYPE / ENTITY STATUS', y)
  y += 20
  checkbox(ctx, true, 0, y)
  drawText(ctx, 'Provisional Application under 35 U.S.C. 111(b)', 14, y, { size: 9, font: regular })
  y += 18
  drawText(ctx, 'Entity Status -- check one:', 0, y, { size: 7.5, font: bold, color: [0.3, 0.3, 0.3] })
  y += 12
  const entityRows = [
    { label: `Micro Entity -- 37 CFR 1.29  -  ~$${USPTO_FEES.provisional.micro} provisional fee` },
    { label: `Small Entity -- 37 CFR 1.27  -  ~$${USPTO_FEES.provisional.small} provisional fee` },
    { label: `Undiscounted (Large Entity)  -  ~$${USPTO_FEES.provisional.large} provisional fee` },
  ]
  for (const row of entityRows) {
    checkbox(ctx, false, 0, y)
    drawText(ctx, row.label, 14, y, { size: 9, font: regular })
    y += 14
  }
  y += 10

  // ── Section 5: Prior-Filed Applications ──────────────────────────────────────
  sectionHeader(ctx, '5. PRIOR-FILED APPLICATIONS (DOMESTIC BENEFIT / FOREIGN PRIORITY)', y)
  y += 20
  const filingDateFmt = filingDate
    ? new Date(filingDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : ''
  labeledField(ctx, 'Prior Application Number', provisionalNum || '--', 0, 200, y)
  labeledField(ctx, 'Filing Date', filingDateFmt || '--', 210, 140, y)
  labeledField(ctx, 'Relationship', 'Priority/Benefit Claim', 360, CONTENT_W - 360, y)
  y += 24
  drawText(ctx, 'If this IS the provisional, leave blank. Reference this app when filing the non-provisional.', 0, y, {
    size: 7, font: italic, color: [0.5, 0.5, 0.5]
  })
  y += 18

  // ── Section 6: Assignee ──────────────────────────────────────────────────────
  sectionHeader(ctx, '6. ASSIGNEE INFORMATION (IF ANY)', y)
  y += 20
  labeledField(ctx, 'Assignee Name / Organization', assigneeName || '--', 0, CONTENT_W / 2, y)
  labeledField(ctx, 'Assignee Address', assigneeAddr || '--', CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
  y += 28

  // ── Section 7: Signature ─────────────────────────────────────────────────────
  sectionHeader(ctx, '7. SIGNATURE OF APPLICANT OR REPRESENTATIVE', y)
  y += 20
  drawText(ctx, 'Under 37 CFR 1.4(d)(2), a typed /Name/ signature satisfies electronic signature requirements.', 0, y, {
    size: 7, font: italic, color: [0.4, 0.4, 0.4]
  })
  y += 14
  labeledField(ctx, 'Applicant Signature (typed)', signature, 0, CONTENT_W / 2, y)
  labeledField(ctx, 'Date', today, CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
  y += 24
  labeledField(ctx, 'Typed or Printed Name', inventorName, 0, CONTENT_W / 2, y)
  labeledField(ctx, 'Registration Number (Attorney/Agent)', 'N/A -- Pro Se Filer', CONTENT_W / 2 + 4, CONTENT_W / 2 - 4, y)
  y += 30

  // ── Footer ──────────────────────────────────────────────────────────────────
  drawLine(ctx, 0, CONTENT_W, y, 0.5)
  y += 6
  drawText(ctx, `Form PTO/AIA/14  -  Generated by PatentPending.app  -  ${todayLong}`, 0, y, {
    size: 7, font: regular, color: [0.5, 0.5, 0.5]
  })
  drawText(ctx, 'File at patentcenter.uspto.gov  -  PatentPending.app is not a law firm.', 0, y + 10, {
    size: 7, font: regular, color: [0.5, 0.5, 0.5]
  })

  // ── Finalize ────────────────────────────────────────────────────────────────
  const pdfBytes = await doc.save()
  return pdfBytes
}
