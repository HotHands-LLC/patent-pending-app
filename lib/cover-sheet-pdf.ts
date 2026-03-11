/**
 * lib/cover-sheet-pdf.ts
 *
 * USPTO Application Data Sheet (ADS) — PTO/AIA/14
 * Server-side PDF generator using pdf-lib (pure JS, Vercel-compatible).
 *
 * APPROACH: Faithful pdf-lib reconstruction of PTO/AIA/14 layout.
 * The official form is Adobe LiveCycle XFA — requires proprietary Adobe runtime
 * and cannot be filled by any standard PDF library (pdf-lib, PyMuPDF, pypdf,
 * pdfjs). This generator reconstructs the form layout using the exact section
 * numbering, field labels, and OMB metadata from the official form.
 *
 * All text values pass through sanitizeForPdf() — WinAnsiEncoding only (0-255).
 * Field labels are ALL-CAPS inline. Section bars are dark navy.
 * Grid cells use light borders to match the official form visual style.
 *
 * Function signature is stable — callers do not need to change.
 * Output: PDF 1.7 — USPTO Patent Center accepts PDF 1.4–1.7.
 */

import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, RGB } from 'pdf-lib'
import { sanitizeForPdf } from '@/lib/pdf-sanitize'

// ── Page geometry (Letter) ────────────────────────────────────────────────────
const PTS_PER_INCH = 72
const PAGE_W       = 8.5 * PTS_PER_INCH   // 612 pt
const PAGE_H       = 11  * PTS_PER_INCH   // 792 pt
const MARGIN_X     = 0.75 * PTS_PER_INCH  // 54 pt (left + right)
const MARGIN_TOP   = 0.5 * PTS_PER_INCH   // 36 pt top — tighter than 9C to fit all sections
const CONTENT_W    = PAGE_W - MARGIN_X * 2 // 504 pt usable width

// ── Colours ───────────────────────────────────────────────────────────────────
const C_NAVY    = rgb(0.12, 0.14, 0.22)   // section header bars
const C_HDR_TXT = rgb(1,    1,    1)      // white text on navy
const C_LABEL   = rgb(0.38, 0.38, 0.38)  // field labels (small caps)
const C_BORDER  = rgb(0.65, 0.65, 0.65)  // grid cell borders
const C_NOTE    = rgb(0.50, 0.50, 0.50)  // footnotes / italic notes
const C_WARN    = rgb(0.65, 0.35, 0.0)   // orange draft warning
const C_BLACK   = rgb(0,    0,    0)

// ── Typography ────────────────────────────────────────────────────────────────
const SZ_HEADER_TITLE = 13    // "APPLICATION DATA SHEET"
const SZ_HDR_BAR      = 7.5  // section bar text
const SZ_SUBHDR       = 7    // sub-section label (e.g. "INVENTOR 1")
const SZ_FIELD_LABEL  = 6    // tiny ALL-CAPS label above underline
const SZ_FIELD_VALUE  = 8.5  // filled value
const SZ_BODY         = 8.5  // checkbox labels, inline text
const SZ_NOTE         = 6.5  // footnotes, disclaimers
const SZ_FOOTER       = 6    // bottom-of-page footer

// ── Layout rhythm ─────────────────────────────────────────────────────────────
const HDR_BAR_H       = 13   // section header bar height
const HDR_AFTER       = 14   // y-advance after entering a section bar
const FIELD_ROW_H     = 16   // standard labeled-field row
const FIELD_LABEL_DY  = 1    // label y within row (from row top)
const FIELD_VALUE_DY  = 9    // value y within row
const FIELD_LINE_DY   = 11   // underline y within row
const FIELD_PAD_X     = 3    // left padding inside a cell
const CHECKBOX_H      = 11   // checkbox row height
const NOTE_H          = 10   // note / instruction row height
const SEC_GAP         = 7    // gap before next section bar
const SUB_GAP         = 6    // gap after sub-header line

// ── Column grid ───────────────────────────────────────────────────────────────
const COL_GAP   = 4                           // gap between columns
const COL2_W    = (CONTENT_W - COL_GAP) / 2   // ~250 pt
const COL2_X2   = COL2_W + COL_GAP            // ~254 pt

const COL3_W    = (CONTENT_W - COL_GAP * 2) / 3  // ~165 pt
const COL3_X2   = COL3_W + COL_GAP
const COL3_X3   = (COL3_W + COL_GAP) * 2

// Section 5 (Prior App) column widths
const S5_C1W    = 200
const S5_C2X    = S5_C1W + COL_GAP
const S5_C2W    = 130
const S5_C3X    = S5_C2X + S5_C2W + COL_GAP
const S5_C3W    = CONTENT_W - S5_C3X

// Section 6 (App Info) column widths
const S6_C1W    = 160   // entity status block
const S6_C2X    = S6_C1W + COL_GAP
const S6_C2W    = CONTENT_W - S6_C2X

// ── Drawing context ───────────────────────────────────────────────────────────
interface Ctx {
  page:    PDFPage
  bold:    PDFFont
  regular: PDFFont
  italic:  PDFFont
}

function toY(yFromTop: number): number {
  return PAGE_H - MARGIN_TOP - yFromTop
}

function dt(
  ctx: Ctx,
  raw: string,
  x: number,
  yTop: number,
  opts: { sz?: number; font?: PDFFont; color?: RGB; maxW?: number } = {}
) {
  const sz    = opts.sz    ?? SZ_BODY
  const font  = opts.font  ?? ctx.regular
  const color = opts.color ?? C_BLACK
  let str = sanitizeForPdf(raw)
  if (opts.maxW && font.widthOfTextAtSize(str, sz) > opts.maxW) {
    while (str.length > 0 && font.widthOfTextAtSize(str + '...', sz) > opts.maxW) {
      str = str.slice(0, -1)
    }
    str += '...'
  }
  ctx.page.drawText(str, {
    x:     MARGIN_X + x,
    y:     toY(yTop),
    size:  sz,
    font,
    color,
  })
}

function hRule(ctx: Ctx, x1: number, x2: number, yTop: number, thick = 0.4, color = C_BORDER) {
  ctx.page.drawLine({
    start: { x: MARGIN_X + x1, y: toY(yTop) },
    end:   { x: MARGIN_X + x2, y: toY(yTop) },
    thickness: thick,
    color,
  })
}

function vRule(ctx: Ctx, x: number, y1Top: number, y2Top: number, thick = 0.4) {
  ctx.page.drawLine({
    start: { x: MARGIN_X + x, y: toY(y1Top) },
    end:   { x: MARGIN_X + x, y: toY(y2Top) },
    thickness: thick,
    color: C_BORDER,
  })
}

/**
 * Cell border: draws a box around a field cell.
 * xRel, yTop are relative to MARGIN_X and MARGIN_TOP.
 */
function cellBorder(ctx: Ctx, xRel: number, yTop: number, w: number, h: number) {
  ctx.page.drawRectangle({
    x:           MARGIN_X + xRel,
    y:           toY(yTop + h),
    width:       w,
    height:      h,
    borderColor: C_BORDER,
    borderWidth: 0.4,
    color:       rgb(1, 1, 1),
  })
}

/**
 * Section header bar — full content width, navy background, white text.
 * yTop: top of bar. Advances to SECTION_AFTER below bar.
 */
function sectionBar(ctx: Ctx, text: string, yTop: number): void {
  ctx.page.drawRectangle({
    x:      MARGIN_X,
    y:      toY(yTop + HDR_BAR_H),
    width:  CONTENT_W,
    height: HDR_BAR_H,
    color:  C_NAVY,
  })
  dt(ctx, text, FIELD_PAD_X, yTop + 2.5, {
    sz: SZ_HDR_BAR, font: ctx.bold, color: C_HDR_TXT,
    maxW: CONTENT_W - FIELD_PAD_X * 2,
  })
}

/**
 * Labeled field with cell border, label, value, and underline.
 * Returns nothing — caller advances y by FIELD_ROW_H.
 */
function field(ctx: Ctx, label: string, value: string, x: number, w: number, yTop: number) {
  cellBorder(ctx, x, yTop, w, FIELD_ROW_H)
  dt(ctx, label.toUpperCase(), x + FIELD_PAD_X, yTop + FIELD_LABEL_DY, {
    sz: SZ_FIELD_LABEL, font: ctx.bold, color: C_LABEL,
  })
  dt(ctx, value, x + FIELD_PAD_X, yTop + FIELD_VALUE_DY, {
    sz: SZ_FIELD_VALUE, font: ctx.regular, maxW: w - FIELD_PAD_X * 2,
  })
}

/**
 * Checkbox row — small bordered box with optional 'X' fill, then label text.
 */
function cbRow(ctx: Ctx, checked: boolean, label: string, x: number, yTop: number, labelW?: number) {
  const BOX = 7
  // Draw box
  ctx.page.drawRectangle({
    x:           MARGIN_X + x,
    y:           toY(yTop + BOX + 1),
    width:       BOX,
    height:      BOX,
    borderColor: C_BORDER,
    borderWidth: 0.5,
    color:       checked ? C_NAVY : rgb(1, 1, 1),
  })
  if (checked) {
    // 'X' is codepoint 88 — always WinAnsi-safe
    dt(ctx, 'X', x + 1, yTop + 2, { sz: 6, font: ctx.bold, color: C_HDR_TXT })
  }
  dt(ctx, label, x + BOX + 3, yTop + 1.5, {
    sz: SZ_BODY, font: ctx.regular, maxW: labelW,
  })
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildCoverSheetPdf(
  patent:  Record<string, unknown>,
  profile: Record<string, unknown> | null
): Promise<Uint8Array> {

  const doc = await PDFDocument.create()
  doc.setProducer('PatentPending.app')
  doc.setCreator('PatentPending.app — patentpending.app')
  doc.setTitle(sanitizeForPdf(`ADS -- ${patent.title ?? 'Patent Application'}`))
  doc.setSubject('USPTO Application Data Sheet 37 CFR 1.76 (PTO/AIA/14 equivalent)')
  doc.setKeywords(['USPTO', 'ADS', 'Application Data Sheet', 'PTO/AIA/14', 'patent'])

  const page = doc.addPage([PAGE_W, PAGE_H])
  const [bold, regular, italic] = await Promise.all([
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaOblique),
  ])
  const ctx: Ctx = { page, bold, regular, italic }

  // ── Extract + sanitize data ────────────────────────────────────────────────
  const title         = sanitizeForPdf((patent.title          as string) ?? '')
  const provNum       = sanitizeForPdf((patent.provisional_number as string) ?? (patent.provisional_app_number as string) ?? '')
  const filingDateRaw = (patent.filing_date as string) ?? (patent.provisional_filed_at as string) ?? ''
  const inventors     = (patent.inventors as string[]) ?? []

  const p = profile ?? {}
  const nameFirst  = sanitizeForPdf((p.name_first  as string) ?? '')
  const nameMid    = sanitizeForPdf((p.name_middle  as string) ?? '')
  const nameLast   = sanitizeForPdf((p.name_last    as string) ?? '')
  const addr1      = sanitizeForPdf((p.address_line_1 as string) ?? '')
  const city       = sanitizeForPdf((p.city         as string) ?? '')
  const state      = sanitizeForPdf((p.state        as string) ?? '')
  const zip        = sanitizeForPdf((p.zip          as string) ?? '')
  const country    = sanitizeForPdf((p.country      as string) ?? 'US')
  const phone      = sanitizeForPdf((p.phone        as string) ?? '')
  const email      = sanitizeForPdf((p.email        as string) ?? '')
  const custNum    = sanitizeForPdf((p.uspto_customer_number   as string) ?? '')
  const assigneeNm = sanitizeForPdf((p.default_assignee_name   as string) ?? '')
  const assigneeAd = sanitizeForPdf((p.default_assignee_address as string) ?? '')

  const inventorName = [nameFirst, nameMid, nameLast].filter(Boolean).join(' ')
                    || sanitizeForPdf(inventors[0] ?? '')

  const today     = new Date().toLocaleDateString('en-US',
    { month: '2-digit', day: '2-digit', year: 'numeric' })
  const todayLong = new Date().toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric' })

  const filingDateFmt = filingDateRaw
    ? new Date((filingDateRaw.includes('T') ? filingDateRaw : filingDateRaw + 'T00:00:00'))
        .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : ''

  const signature = `/${inventorName}/`

  // ── Running y cursor ────────────────────────────────────────────────────────
  let y = 0

  // ════════════════════════════════════════════════════════════════════════════
  // FORM HEADER
  // ════════════════════════════════════════════════════════════════════════════

  // Top row: form ID left, OMB right
  dt(ctx, 'PTO/AIA/14 (Equivalent)', 0, y + 8, { sz: SZ_NOTE, font: bold, color: C_LABEL })
  dt(ctx, 'OMB 0651-0032', CONTENT_W - 70, y + 8, { sz: SZ_NOTE, font: ctx.regular, color: C_LABEL })
  y += 11

  // Form title — large and bold
  dt(ctx, 'APPLICATION DATA SHEET', 0, y + 11, { sz: SZ_HEADER_TITLE, font: bold })
  y += 14

  // Sub-title
  dt(ctx, '37 CFR 1.76  |  Form PTO/AIA/14  |  Provisional Application', 0, y + 6, {
    sz: SZ_NOTE + 0.5, font: italic, color: C_NOTE,
  })
  y += 9

  // Thin rule
  hRule(ctx, 0, CONTENT_W, y, 1.0, rgb(0.25, 0.28, 0.4))
  y += 4

  // Meta row: generated date left, draft warning right
  dt(ctx, `Generated ${todayLong}  |  PatentPending.app`, 0, y + 1, {
    sz: SZ_NOTE, font: italic, color: C_NOTE,
  })
  dt(ctx, 'DRAFT -- Review all fields before filing', CONTENT_W - 160, y + 1, {
    sz: SZ_NOTE, font: bold, color: C_WARN,
  })
  y += NOTE_H

  // ── Docket / App number header row ──────────────────────────────────────────
  const HDR_ROW_H = FIELD_ROW_H - 2
  field(ctx, 'Attorney Docket Number',
    sanitizeForPdf((patent.docket_number as string) ?? '(leave blank for pro se)'),
    0, COL2_W, y)
  field(ctx, 'Application Number (assigned by USPTO)',
    sanitizeForPdf((patent.provisional_app_number as string) ?? 'Assigned upon filing'),
    COL2_X2, COL2_W, y)
  y += HDR_ROW_H + SEC_GAP

  // ── Title of Invention (near top — mirrors official form position) ───────────
  field(ctx, 'Title of Invention', title, 0, CONTENT_W, y)
  y += FIELD_ROW_H + SEC_GAP

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 1: INVENTOR INFORMATION
  // ════════════════════════════════════════════════════════════════════════════
  sectionBar(ctx, '1. INVENTOR INFORMATION  (First Named Inventor)', y)
  y += HDR_AFTER

  // Name row — three columns
  field(ctx, 'Given Name (First)',  nameFirst,  0,       COL3_W, y)
  field(ctx, 'Middle Name',         nameMid,    COL3_X2, COL3_W, y)
  field(ctx, 'Family Name (Last)',  nameLast,   COL3_X3, COL3_W, y)
  y += FIELD_ROW_H

  // Address row
  field(ctx, 'Mailing Address',  addr1, 0,      COL2_W, y)
  field(ctx, 'City',             city,  COL2_X2, COL2_W, y)
  y += FIELD_ROW_H

  // State / Zip / Country
  field(ctx, 'State',        state,   0,       COL3_W, y)
  field(ctx, 'Postal Code',  zip,     COL3_X2, COL3_W, y)
  field(ctx, 'Country',      country, COL3_X3, COL3_W, y)
  y += FIELD_ROW_H

  // Phone / Email
  field(ctx, 'Telephone',  phone, 0,      COL2_W, y)
  field(ctx, 'Email',      email, COL2_X2, COL2_W, y)
  y += FIELD_ROW_H

  // Citizenship / Residence
  field(ctx, 'Citizenship',                'United States', 0,      COL2_W, y)
  field(ctx, 'USPTO Customer Number (opt)', custNum || '--', COL2_X2, COL2_W, y)
  y += FIELD_ROW_H + SEC_GAP

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 2: CORRESPONDENCE INFORMATION
  // ════════════════════════════════════════════════════════════════════════════
  sectionBar(ctx, '2. CORRESPONDENCE INFORMATION', y)
  y += HDR_AFTER

  field(ctx, 'Applicant Name / Firm Name',
    inventorName ? `${inventorName} (Pro Se)` : 'Pro Se (self-represented)',
    0, CONTENT_W, y)
  y += FIELD_ROW_H

  field(ctx, 'Mailing Address', addr1, 0, CONTENT_W, y)
  y += FIELD_ROW_H

  field(ctx, 'City',  city,  0,       COL3_W, y)
  field(ctx, 'State', state, COL3_X2, COL3_W, y)
  field(ctx, 'ZIP',   zip,   COL3_X3, COL3_W, y)
  y += FIELD_ROW_H

  field(ctx, 'Telephone', phone, 0,      COL2_W, y)
  field(ctx, 'Email',     email, COL2_X2, COL2_W, y)
  y += FIELD_ROW_H + SEC_GAP

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 3: APPLICATION INFORMATION
  // ════════════════════════════════════════════════════════════════════════════
  sectionBar(ctx, '3. APPLICATION INFORMATION', y)
  y += HDR_AFTER

  // Application type — checkbox row
  dt(ctx, 'Application Type:', 0, y + 1, { sz: SZ_SUBHDR, font: bold, color: C_LABEL })
  y += SUB_GAP

  cbRow(ctx, true,  'Provisional Application  (35 U.S.C. 111(b))', 0, y, CONTENT_W - 20)
  y += CHECKBOX_H
  cbRow(ctx, false, 'Nonprovisional (35 U.S.C. 111(a))',            0, y, CONTENT_W - 20)
  y += CHECKBOX_H
  cbRow(ctx, false, 'PCT International Application',                 0, y, CONTENT_W - 20)
  y += CHECKBOX_H + 3

  // Entity status — left block
  dt(ctx, 'Entity Status (check one):', 0, y + 1, { sz: SZ_SUBHDR, font: bold, color: C_LABEL })
  y += SUB_GAP

  // Draw entity status cells side by side with checked state
  const ENT_W = (CONTENT_W - COL_GAP * 2) / 3
  const ENT_X2 = ENT_W + COL_GAP
  const ENT_X3 = (ENT_W + COL_GAP) * 2

  cellBorder(ctx, 0,      y, ENT_W, CHECKBOX_H + 4)
  cellBorder(ctx, ENT_X2, y, ENT_W, CHECKBOX_H + 4)
  cellBorder(ctx, ENT_X3, y, ENT_W, CHECKBOX_H + 4)

  cbRow(ctx, true,  'Micro Entity (37 CFR 1.29)',          2,          y + 1)
  cbRow(ctx, false, 'Small Entity (37 CFR 1.27)',           ENT_X2 + 2, y + 1)
  cbRow(ctx, false, 'Undiscounted (Large Entity)',           ENT_X3 + 2, y + 1)
  y += CHECKBOX_H + 6 + SEC_GAP

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 4: PRIOR-FILED APPLICATIONS
  // ════════════════════════════════════════════════════════════════════════════
  sectionBar(ctx, '4. PRIOR-FILED APPLICATIONS / DOMESTIC BENEFIT  (37 CFR 1.78)', y)
  y += HDR_AFTER

  field(ctx, 'Prior Application Number',  provNum || '--',             0,       S5_C1W, y)
  field(ctx, 'Filing Date',               filingDateFmt || '--',       S5_C2X,  S5_C2W, y)
  field(ctx, 'Relationship / Status',     'Provisional filed',         S5_C3X,  S5_C3W, y)
  y += FIELD_ROW_H

  dt(ctx,
    'If filing the provisional: leave Application Number blank (assigned by USPTO). ' +
    'When filing the non-provisional, reference this provisional number above.',
    0, y + 1, { sz: SZ_NOTE, font: italic, color: C_NOTE })
  y += NOTE_H + SEC_GAP

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 5: ASSIGNEE INFORMATION
  // ════════════════════════════════════════════════════════════════════════════
  sectionBar(ctx, '5. ASSIGNEE INFORMATION  (leave blank if inventor is sole owner)', y)
  y += HDR_AFTER

  field(ctx, 'Assignee / Organization Name',  assigneeNm || '--',  0,      COL2_W, y)
  field(ctx, 'Assignee Mailing Address',       assigneeAd || '--',  COL2_X2, COL2_W, y)
  y += FIELD_ROW_H + SEC_GAP

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 6: SIGNATURE
  // ════════════════════════════════════════════════════════════════════════════
  sectionBar(ctx, '6. SIGNATURE OF APPLICANT  (37 CFR 1.4(d)(2) -- typed /Name/ is a valid S-signature)', y)
  y += HDR_AFTER

  field(ctx, 'Applicant Signature (S-signature)',  signature, 0,      COL2_W, y)
  field(ctx, 'Date',                               today,     COL2_X2, COL2_W, y)
  y += FIELD_ROW_H

  field(ctx, 'Printed Name',                              inventorName,    0,      COL2_W, y)
  field(ctx, 'Registration Number (Attorney/Agent only)', 'N/A -- Pro Se', COL2_X2, COL2_W, y)
  y += FIELD_ROW_H + SEC_GAP

  // ── Footer ──────────────────────────────────────────────────────────────────
  hRule(ctx, 0, CONTENT_W, y, 0.5, C_NOTE)
  y += 5
  dt(ctx, `Form PTO/AIA/14 equivalent  |  Generated ${todayLong} by PatentPending.app`, 0, y, {
    sz: SZ_FOOTER, font: regular, color: C_NOTE,
  })
  dt(ctx, 'patentcenter.uspto.gov  |  PatentPending.app is not a law firm. Not legal advice.', 0, y + 8, {
    sz: SZ_FOOTER, font: regular, color: C_NOTE,
  })

  return doc.save()
}
