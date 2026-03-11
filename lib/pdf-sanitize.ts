/**
 * lib/pdf-sanitize.ts
 *
 * Sanitize strings for use with pdf-lib StandardFonts (WinAnsiEncoding).
 * WinAnsi only encodes codepoints 0x20–0xFF (printable Latin-1).
 * Any character outside that range throws at pdf-lib drawText time:
 *   Error: WinAnsi cannot encode "X" (0xNNNN)
 *
 * Strategy: map common symbols to ASCII equivalents, strip the rest.
 * Apply sanitizeForPdf() to EVERY string before passing to page.drawText().
 */

const REPLACEMENTS: Record<string, string> = {
  '\u2713': 'X',    // ✓ check mark
  '\u2714': 'X',    // ✔ heavy check mark
  '\u2715': 'X',    // ✕ multiplication x
  '\u2716': 'X',    // ✖ heavy multiplication x
  '\u26a0': '(!)',  // ⚠ warning sign
  '\u2022': '-',    // • bullet
  '\u2018': "'",    // ' left single quote
  '\u2019': "'",    // ' right single quote
  '\u201c': '"',    // " left double quote
  '\u201d': '"',    // " right double quote
  '\u2013': '-',    // – en dash
  '\u2014': '--',   // — em dash
  '\u00a9': '(c)',  // © copyright
  '\u00ae': '(R)',  // ® registered
  '\u2122': '(TM)', // ™ trademark
  '\u2026': '...', // … ellipsis
  '\u00b7': '-',    // · middle dot
  '\u2192': '->',   // → right arrow
  '\u2190': '<-',   // ← left arrow
  '\u00b0': 'deg',  // ° degree sign
  '\u00d7': 'x',    // × multiplication sign
  '\u00f7': '/',    // ÷ division sign
  '\u2260': '!=',   // ≠ not equal
  '\u2264': '<=',   // ≤ less-than or equal
  '\u2265': '>=',   // ≥ greater-than or equal
}

export function sanitizeForPdf(input: unknown): string {
  if (input === null || input === undefined) return ''
  let result = String(input)
  // Apply known replacements first
  for (const [char, replacement] of Object.entries(REPLACEMENTS)) {
    result = result.split(char).join(replacement)
  }
  // Strip any remaining non-WinAnsi characters
  // Keep: tab (0x09), newline (0x0A), carriage return (0x0D), space–ÿ (0x20–0xFF)
  result = result.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '')
  return result
}
