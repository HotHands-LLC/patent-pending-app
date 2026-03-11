// lib/cover-sheet-pdf.ts
// USPTO Application Data Sheet (ADS) — server-side PDF generator
// Uses pdf-lib (pure JS, no native deps, Vercel-compatible)
// Output: PDF 1.7 compliant — USPTO accepts PDF 1.4–1.7

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import { USPTO_FEES } from '@/lib/uspto-fees'
import { sanitizeForPdf } from '@/lib/pdf-sanitize'

// ── Page geometry ─────────────────────────────────────────────────────────────
const PTS_PER_INCH = 72
const PAGE_W       = 8.5 * PTS_PER_INCH   // 612pt
const PAGE_H       = 11  * PTS_PER_INCH   // 792pt
const MARGIN_X     = 0.75 * PTS_PER_INCH  // 54pt — left/right margin
const MARGIN_TOP   = 0.75 * PTS_PER_INCH  // 54pt — top margin
const CONTENT_W    = PAGE_W - MARGIN_X * 2 // 504pt usable width

// ── Layout constants (all x-values are relative to MARGIN_X) ─────────────────
//
// Section header bar
const HDR_H         = 16   // section header bar height (pt)
const HDR_TXT_X     = 6    // text x-indent inside header bar
const HDR_TXT_SIZE  = 8    // section title font size

// Field grid
const FIELD_LABEL_SIZE = 6.5   // all-caps tiny label (e.g. "GIVEN NAME")
const FIELD_VALUE_SIZE = 9     // field value text
const FIELD_LABEL_DY   = 0     // label y-offset from row top
const FIELD_VALUE_DY   = 11    // value y-offset from row top (below label)
const FIELD_LINE_DY    = 12    // underline y-offset from row top

// Font sizes for non-field text
const FONT_BODY    = 9    // checkbox labels, inline text
const FONT_MEDIUM  = 7.5  // sub-section headings
const FONT_SMALL   = 7    // notes, disclaimers, footer

// Vertical rhythm — y-advance amounts
// Tuned so all 7 sections + header + footer fit within ~684pt usable height
const SECTION_AFTER   = 17   // y advance after entering a section (past header bar)
const FIELD_ROW_H     = 18   // standard field row height
const FIELD_ROW_SM    = 16   // compact field row (checkbox-adjacent fields)
const CHECKBOX_ROW_H  = 12   // checkbox item row height
const NOTE_ROW_H      = 13   // note / instruction line height
const SECTION_END_GAP =  8   // extra gap before next section bar
const SUBSECTION_GAP  =  8   // gap after a sub-header within a section

// Column grid — three-up and two-up layouts
// COL2: 50/50 split (two equal halves)
const COL_GAP  = 6                          // gap between adjacent columns
const COL2_W   = (CONTENT_W - COL_GAP) / 2  // ~249pt per half
const COL2_X2  = COL2_W + COL_GAP           // start of right half (~255pt)

// COL3: equal thirds
const COL3_W   = (CONTENT_W - COL_GAP * 2) / 3  // ~164pt per third
const COL3_X2  = COL3_W + COL_GAP                // start of 2nd third (~170pt)
const COL3_X3  = (COL3_W + COL_GAP) * 2          // start of 3rd third (~340pt)

// Section 5 special: App# / Date / Relationship
const S5_COL1_W = 210   // Application Number field width
const S5_COL2_X = S5_COL1_W + COL_GAP        // 216
const S5_COL2_W = 140   // Filing Date field width
const S5_COL3_X = S5_COL2_X + S5_COL2_W + COL_GAP  // 362
const S5_COL3_W = CONTENT_W - S5_COL3_X      // remainder

// ── Drawing helpers ───────────────────────────────────────────────────────────

interface DrawCtx {
  page: PDFPage
  bold: PDFFont
  regular: PDFFont
  italic: PDFFont
}

/** Convert a y-from-top offset to pdf-lib's bottom-origin y coordinate */
function toY(yFromTop: number): number {
  return PAGE_H - MARGIN_TOP - yFromTop
}

/**
 * Draw text at position (MARGIN_X + x, toY(yTop)).
 * Applies sanitizeForPdf to ALL text — WinAnsiEncoding safety net.
 * Truncates to maxWidth using '...' (not U+2026 ellipsis).
 */
function drawText(ctx: DrawCtx, text: string, x: number, yTop: number, opts: {
  size?: number
  font?: PDFFont
  color?: [number, number, number]
  maxWidth?: number
} = {}) {
  const size  = opts.size  ?? FONT_BODY
  const font  = opts.font  ?? ctx.regular
  const [r, g, b] = opts.color ?? [0, 0, 0]

  // WinAnsi safety — sanitize before every drawText call
  let str = sanitizeForPdf(text)

  if (opts.maxWidth && font.widthOfTextAtSize(str, size) > opts.maxWidth) {
    while (str.length > 0 && font.widthOfTextAtSize(str + '...', size) > opts.maxWidth) {
      str = str.slice(0, -1)
    }
    str = str + '...'
  }

  ctx.page.drawText(str, {
    x: MARGIN_X + x,
    y: toY(yTop),
    size,
    font,
    color: rgb(r, g, b),
  })
}

function drawHRule(ctx: DrawCtx, x1: number, x2: number, yTop: number, thickness = 0.5) {
  ctx.page.drawLine({
    start: { x: MARGIN_X + x1, y: toY(yTop) },
    end:   { x: MARGIN_X + x2, y: toY(yTop) },
    thickness,
    color: rgb(0.3, 0.3, 0.3),
  })
}

/**
 * Dark navy section header bar spanning full content width.
 * Returns y-advance needed to clear the bar (caller adds SECTION_AFTER).
 */
function sectionHeader(ctx: DrawCtx, text: string, yTop: number): void {
  ctx.page.drawRectangle({
    x:      MARGIN_X,
    y:      toY(yTop + HDR_H),
    width:  CONTENT_W,
    height: HDR_H,
    color:  rgb(0.12, 0.14, 0.22),
  })
  drawText(ctx, text, HDR_TXT_X, yTop + 2, {
    size:  HDR_TXT_SIZE,
    font:  ctx.bold,
    color: [1, 1, 1],
  })
}

/**
 * Labeled form field: all-caps label + value + underline.
 * x, w — position and width within the content area.
 * yTop  — top of the label text.
 */
function labeledField(
  ctx: DrawCtx,
  label: string,
  value: string,
  x: number,
  w: number,
  yTop: number
): void {
  drawText(ctx, label.toUpperCase(), x, yTop + FIELD_LABEL_DY, {
    size:  FIELD_LABEL_SIZE,
    font:  ctx.bold,
    color: [0.4, 0.4, 0.4],
  })
  drawText(ctx, value, x, yTop + FIELD_VALUE_DY, {
    size:     FIELD_VALUE_SIZE,
    font:     ctx.regular,
    maxWidth: w - 4,
  })
  drawHRule(ctx, x, x + w, yTop + FIELD_LINE_DY)
}

/**
 * Checkbox square with optional filled 'X'.
 * x, yTop — position of the box.
 */
function checkbox(ctx: DrawCtx, checked: boolean, x: number, yTop: number): void {
  ctx.page.drawRectangle({
    x:           MARGIN_X + x,
    y:           toY(yTop + 8),
    width:       8,
    height:      8,
    borderColor: rgb(0.3, 0.3, 0.3),
    borderWidth: 0.5,
    color:       checked ? rgb(0.12, 0.14, 0.22) : rgb(1, 1, 1),
  })
  if (checked) {
    // 'X' is WinAnsi-safe (codepoint 88); drawText sanitizes as backup
    drawText(ctx, 'X', x + 1, yTop + 1, {
      size:  7,
      font:  ctx.bold,
      color: [1, 1, 1],
    })
  }
}

// ── Main PDF builder ──────────────────────────────────────────────────────────

export async function buildCoverSheetPdf(
  patent:  Record<string, unknown>,
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

  const ctx: DrawCtx = { page, bold, regular, italic }

  // ── Extract + sanitize all data fields ──────────────────────────────────────
  const title          = sanitizeForPdf((patent.title as string) ?? '')
  const provisionalNum = sanitizeForPdf((patent.provisional_number as string) ?? '')
  const filingDate     = (patent.filing_date as string) ?? ''
  const inventors      = (patent.inventors as string[]) ?? []

  const firstName    = sanitizeForPdf((profile?.name_first as string) ?? '')
  const middleName   = sanitizeForPdf((profile?.name_middle as string) ?? '')
  const lastName     = sanitizeForPdf((profile?.name_last as string) ?? '')
  const inventorName = [firstName, middleName, lastName].filter(Boolean).join(' ')
                    || sanitizeForPdf(inventors[0] ?? '')

  const address1     = sanitizeForPdf((profile?.address_line_1 as string) ?? '')
  const city         = sanitizeForPdf((profile?.city as string) ?? '')
  const state        = sanitizeForPdf((profile?.state as string) ?? '')
  const zip          = sanitizeForPdf((profile?.zip as string) ?? '')
  const country      = sanitizeForPdf((profile?.country as string) ?? 'US')
  const phone        = sanitizeForPdf((profile?.phone as string) ?? '')
  const email        = sanitizeForPdf((profile?.email as string) ?? '')
  const customerNum  = sanitizeForPdf((profile?.uspto_customer_number as string) ?? '')
  const assigneeName = sanitizeForPdf((profile?.default_assignee_name as string) ?? '')
  const assigneeAddr = sanitizeForPdf((profile?.default_assignee_address as string) ?? '')

  const today    = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const todayLong = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const signature = `/${inventorName}/`

  // ── Header ──────────────────────────────────────────────────────────────────
  let y = 0

  // Agency name — flush left, small caps style
  drawText(ctx, 'UNITED STATES PATENT AND TRADEMARK OFFICE', 0, y + 10, {
    size: FIELD_LABEL_SIZE + 1,
    font: bold,
    color: [0.12, 0.14, 0.22],
  })
  y += 16

  // Form title — flush left
  drawText(ctx, 'APPLICATION DATA SHEET', 0, y + 10, { size: 13, font: bold })
  y += 14

  // Sub-title line — flush left, smaller
  drawText(ctx, '37 CFR 1.76  -  Form PTO/AIA/14', 0, y + 4, {
    size: FONT_SMALL,
    font: italic,
    color: [0.4, 0.4, 0.4],
  })
  y += 12

  drawHRule(ctx, 0, CONTENT_W, y, 1.5)
  y += 6

  // Meta line — flush left; draft warning right-aligned within content area
  drawText(ctx, `Generated ${todayLong} by PatentPending.app  -  File at patentcenter.uspto.gov`, 0, y, {
    size: FONT_SMALL,
    font: italic,
    color: [0.5, 0.5, 0.5],
  })
  drawText(ctx, '(!) DRAFT -- Review all fields before filing', 290, y, {
    size: FONT_SMALL,
    font: bold,
    color: [0.7, 0.4, 0],
  })
  y += NOTE_ROW_H

  // ── Section 1: Application Information ──────────────────────────────────────
  sectionHeader(ctx, '1. APPLICATION INFORMATION', y)
  y += SECTION_AFTER

  labeledField(ctx, 'Title of Invention', title, 0, CONTENT_W, y)
  y += FIELD_ROW_H

  labeledField(ctx, 'Application Number', 'Assigned by USPTO upon filing', 0, S5_COL1_W, y)
  labeledField(ctx, 'Filing Date',        'Assigned by USPTO',             S5_COL2_X, S5_COL2_W, y)
  labeledField(ctx, 'Customer Number',    customerNum || '--',             S5_COL3_X, S5_COL3_W, y)
  y += FIELD_ROW_H

  labeledField(ctx, 'Attorney Docket Number', '(optional)', 0, COL2_W, y)
  y += FIELD_ROW_H + SECTION_END_GAP

  // ── Section 2: Inventor Information ─────────────────────────────────────────
  sectionHeader(ctx, '2. INVENTOR INFORMATION', y)
  y += SECTION_AFTER

  drawText(ctx, 'Inventor 1 -- First Named Inventor', 0, y, {
    size: FONT_MEDIUM,
    font: bold,
    color: [0.3, 0.3, 0.3],
  })
  y += SUBSECTION_GAP

  // Three-column: Given / Middle / Family
  labeledField(ctx, 'Given Name',  firstName,  0,       COL3_W, y)
  labeledField(ctx, 'Middle Name', middleName, COL3_X2, COL3_W, y)
  labeledField(ctx, 'Family Name', lastName,   COL3_X3, COL3_W, y)
  y += FIELD_ROW_H

  // Two-column: Address / City
  labeledField(ctx, 'Street Address', address1, 0,      COL2_W, y)
  labeledField(ctx, 'City',           city,     COL2_X2, COL2_W, y)
  y += FIELD_ROW_H

  // Three-column: State / ZIP / Country
  labeledField(ctx, 'State',       state,   0,       COL3_W, y)
  labeledField(ctx, 'Postal Code', zip,     COL3_X2, COL3_W, y)
  labeledField(ctx, 'Country',     country, COL3_X3, COL3_W, y)
  y += FIELD_ROW_H

  // Two-column: Phone / Email
  labeledField(ctx, 'Telephone', phone, 0,      COL2_W, y)
  labeledField(ctx, 'Email',     email, COL2_X2, COL2_W, y)
  y += FIELD_ROW_H

  labeledField(ctx, 'Citizenship', 'United States', 0, COL2_W, y)
  y += FIELD_ROW_H + SECTION_END_GAP

  // ── Section 3: Correspondence Information ────────────────────────────────────
  sectionHeader(ctx, '3. CORRESPONDENCE INFORMATION', y)
  y += SECTION_AFTER

  labeledField(ctx, 'Given Name',  firstName, 0,      COL2_W, y)
  labeledField(ctx, 'Family Name', lastName,  COL2_X2, COL2_W, y)
  y += FIELD_ROW_H

  labeledField(ctx, 'Organization / Firm Name', 'Pro Se (self-represented)', 0, CONTENT_W, y)
  y += FIELD_ROW_H

  labeledField(ctx, 'Street Address', address1, 0, CONTENT_W, y)
  y += FIELD_ROW_H

  // Three-column: City / State / ZIP
  labeledField(ctx, 'City',        city,  0,       COL3_W, y)
  labeledField(ctx, 'State',       state, COL3_X2, COL3_W, y)
  labeledField(ctx, 'Postal Code', zip,   COL3_X3, COL3_W, y)
  y += FIELD_ROW_H + SECTION_END_GAP

  // ── Section 4: Application Type / Entity Status ──────────────────────────────
  sectionHeader(ctx, '4. APPLICATION TYPE / ENTITY STATUS', y)
  y += SECTION_AFTER

  checkbox(ctx, true, 0, y)
  drawText(ctx, 'Provisional Application under 35 U.S.C. 111(b)', 14, y, {
    size: FONT_BODY,
    font: regular,
  })
  y += CHECKBOX_ROW_H + 2

  drawText(ctx, 'Entity Status -- check one:', 0, y, {
    size: FONT_MEDIUM,
    font: bold,
    color: [0.3, 0.3, 0.3],
  })
  y += SUBSECTION_GAP

  const entityRows = [
    `Micro Entity -- 37 CFR 1.29  -  ~$${USPTO_FEES.provisional.micro} provisional fee`,
    `Small Entity -- 37 CFR 1.27  -  ~$${USPTO_FEES.provisional.small} provisional fee`,
    `Undiscounted (Large Entity)  -  ~$${USPTO_FEES.provisional.large} provisional fee`,
  ]
  for (const row of entityRows) {
    checkbox(ctx, false, 0, y)
    drawText(ctx, row, 14, y, { size: FONT_BODY, font: regular })
    y += CHECKBOX_ROW_H
  }
  y += SECTION_END_GAP

  // ── Section 5: Prior-Filed Applications ──────────────────────────────────────
  sectionHeader(ctx, '5. PRIOR-FILED APPLICATIONS (DOMESTIC BENEFIT / FOREIGN PRIORITY)', y)
  y += SECTION_AFTER

  const filingDateFmt = filingDate
    ? new Date(filingDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
      })
    : ''

  labeledField(ctx, 'Prior Application Number', provisionalNum || '--',    0,        S5_COL1_W, y)
  labeledField(ctx, 'Filing Date',              filingDateFmt  || '--',    S5_COL2_X, S5_COL2_W, y)
  labeledField(ctx, 'Relationship',             'Priority/Benefit Claim', S5_COL3_X, S5_COL3_W, y)
  y += FIELD_ROW_H

  drawText(
    ctx,
    'If this IS the provisional, leave blank. Reference this app number when filing the non-provisional.',
    0, y,
    { size: FONT_SMALL, font: italic, color: [0.5, 0.5, 0.5] }
  )
  y += NOTE_ROW_H + SECTION_END_GAP

  // ── Section 6: Assignee ──────────────────────────────────────────────────────
  sectionHeader(ctx, '6. ASSIGNEE INFORMATION (IF ANY)', y)
  y += SECTION_AFTER

  labeledField(ctx, 'Assignee Name / Organization', assigneeName || '--', 0,      COL2_W, y)
  labeledField(ctx, 'Assignee Address',              assigneeAddr || '--', COL2_X2, COL2_W, y)
  y += FIELD_ROW_H + SECTION_END_GAP

  // ── Section 7: Signature ─────────────────────────────────────────────────────
  sectionHeader(ctx, '7. SIGNATURE OF APPLICANT OR REPRESENTATIVE', y)
  y += SECTION_AFTER

  drawText(
    ctx,
    'Under 37 CFR 1.4(d)(2), a typed /Name/ signature satisfies electronic signature requirements.',
    0, y,
    { size: FONT_SMALL, font: italic, color: [0.4, 0.4, 0.4] }
  )
  y += NOTE_ROW_H

  labeledField(ctx, 'Applicant Signature (typed)', signature, 0,      COL2_W, y)
  labeledField(ctx, 'Date',                        today,     COL2_X2, COL2_W, y)
  y += FIELD_ROW_H

  labeledField(ctx, 'Typed or Printed Name',                inventorName,       0,      COL2_W, y)
  labeledField(ctx, 'Registration Number (Attorney/Agent)', 'N/A -- Pro Se',    COL2_X2, COL2_W, y)
  y += FIELD_ROW_H + SECTION_END_GAP

  // ── Footer ──────────────────────────────────────────────────────────────────
  drawHRule(ctx, 0, CONTENT_W, y, 0.5)
  y += 6

  drawText(ctx, `Form PTO/AIA/14  -  Generated by PatentPending.app  -  ${todayLong}`, 0, y, {
    size: FONT_SMALL,
    font: regular,
    color: [0.5, 0.5, 0.5],
  })
  drawText(ctx, 'File at patentcenter.uspto.gov  -  PatentPending.app is not a law firm.', 0, y + 10, {
    size: FONT_SMALL,
    font: regular,
    color: [0.5, 0.5, 0.5],
  })

  // ── Finalize ────────────────────────────────────────────────────────────────
  const pdfBytes = await doc.save()
  return pdfBytes
}
