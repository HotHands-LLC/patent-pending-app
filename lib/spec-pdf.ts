/**
 * lib/spec-pdf.ts
 *
 * USPTO-compliant specification PDF generator.
 * Produces: Spec sections → CLAIMS → ABSTRACT (if present)
 *
 * 37 CFR 1.52 requirements:
 * - Paper: 8.5" × 11" (letter) = 612 × 792 pt
 * - Margins: top 1" (72pt), left 1.25" (90pt), right 0.75" (54pt), bottom 1" (72pt)
 * - Font: 12pt minimum, Helvetica (WinAnsiEncoding safe)
 * - Line spacing: 1.5× (18pt leading)
 * - Left-aligned body text
 * - Page numbers: bottom center, starting at 1
 *
 * All text passes through sanitizeForPdf() before rendering.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sanitizeForPdf } from '@/lib/pdf-sanitize'


// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE_W         = 612   // 8.5" × 72
const PAGE_H         = 792   // 11"  × 72
const MARGIN_TOP     = 72    // 1"
const MARGIN_LEFT    = 90    // 1.25"
const MARGIN_RIGHT   = 54    // 0.75"
const MARGIN_BOTTOM  = 72    // 1"
const CONTENT_W      = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT  // 468 pt

// ── Typography ────────────────────────────────────────────────────────────────
const FONT_SIZE      = 12
const LINE_H         = 18    // 1.5× line spacing
const C_BLACK        = rgb(0, 0, 0)

// ── Text wrapping ─────────────────────────────────────────────────────────────
function wrapLine(text: string, font: import('pdf-lib').PDFFont, maxWidth: number, fontSize: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    const w = font.widthOfTextAtSize(test, fontSize)
    if (w <= maxWidth) {
      current = test
    } else {
      if (current) lines.push(current)
      // If single word is too long, just push it (better than infinite loop)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

// ── PatentData shape ─────────────────────────────────────────────────────────
export interface PatentData {
  title?: string | null
  spec_draft?: string | null
  claims_draft?: string | null
  abstract_draft?: string | null
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function buildSpecPdf(patent: PatentData): Promise<Uint8Array> {
  const pdfDoc   = await PDFDocument.create()
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // ── State ──────────────────────────────────────────────────────────────────
  let page  = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y     = PAGE_H - MARGIN_TOP  // current y position (top-down)
  const pages: ReturnType<typeof pdfDoc.addPage>[] = [page]

  // ── Helpers ────────────────────────────────────────────────────────────────

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    y = PAGE_H - MARGIN_TOP
    return page
  }

  function ensureRoom(needed: number) {
    if (y - needed < MARGIN_BOTTOM) {
      newPage()
    }
  }

  /** Render a line of text at current y, then advance y down by LINE_H */
  function drawLine(text: string, opts: { bold?: boolean; center?: boolean } = {}) {
    ensureRoom(LINE_H)
    const f = opts.bold ? boldFont : font
    const sz = FONT_SIZE
    let x = MARGIN_LEFT
    if (opts.center) {
      const tw = f.widthOfTextAtSize(text, sz)
      x = (PAGE_W - tw) / 2
    }
    page.drawText(text, { x, y: y - FONT_SIZE, font: f, size: sz, color: C_BLACK })
    y -= LINE_H
  }

  /** Blank line */
  function blankLine() {
    y -= LINE_H
  }

  /** Wrap and render a block of text (multi-line), handling \n within lines */
  function drawBlock(rawText: string) {
    const paragraphs = rawText.split('\n')
    for (const para of paragraphs) {
      const trimmed = para.trimEnd()
      if (trimmed === '') {
        blankLine()
        continue
      }
      const lines = wrapLine(sanitizeForPdf(trimmed), font, CONTENT_W, FONT_SIZE)
      for (const ln of lines) {
        drawLine(ln)
      }
    }
  }

  /** Section header: bold, all-caps label, blank line after */
  function sectionHeader(label: string) {
    ensureRoom(LINE_H * 2)
    blankLine()
    drawLine(label, { bold: true })
    blankLine()
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = sanitizeForPdf(patent.title ?? 'UNTITLED PATENT APPLICATION')
  // Title: bold, centered, all-caps
  const titleUpper = title.toUpperCase()
  const titleLines = wrapLine(titleUpper, boldFont, CONTENT_W, FONT_SIZE)
  for (const ln of titleLines) {
    ensureRoom(LINE_H)
    const tw = boldFont.widthOfTextAtSize(ln, FONT_SIZE)
    const x = (PAGE_W - tw) / 2
    page.drawText(ln, { x, y: y - FONT_SIZE, font: boldFont, size: FONT_SIZE, color: C_BLACK })
    y -= LINE_H
  }
  blankLine()
  blankLine()

  // ── Specification body ────────────────────────────────────────────────────
  if (patent.spec_draft && patent.spec_draft.trim()) {
    drawBlock(patent.spec_draft)
  } else {
    sectionHeader('SPECIFICATION')
    drawLine('[SPECIFICATION NOT YET GENERATED]')
  }

  // ── CLAIMS ────────────────────────────────────────────────────────────────
  // Always start CLAIMS on a fresh line with clear separation
  ensureRoom(LINE_H * 3)
  blankLine()
  drawLine('CLAIMS', { bold: true })
  blankLine()

  if (patent.claims_draft && patent.claims_draft.trim()) {
    drawBlock(patent.claims_draft)
  } else {
    drawLine('[CLAIMS NOT YET GENERATED]')
  }

  // ── ABSTRACT ─────────────────────────────────────────────────────────────
  if (patent.abstract_draft && patent.abstract_draft.trim()) {
    ensureRoom(LINE_H * 3)
    blankLine()
    drawLine('ABSTRACT', { bold: true })
    blankLine()
    drawBlock(patent.abstract_draft)
  }

  // ── Page numbers ──────────────────────────────────────────────────────────
  const totalPages = pages.length
  for (let i = 0; i < totalPages; i++) {
    const pg   = pages[i]
    const num  = `${i + 1}`
    const tw   = font.widthOfTextAtSize(num, 10)
    const x    = (PAGE_W - tw) / 2
    const yNum = MARGIN_BOTTOM - 20  // below content area
    pg.drawText(num, { x, y: yNum, font, size: 10, color: C_BLACK })
  }

  return pdfDoc.save()
}
