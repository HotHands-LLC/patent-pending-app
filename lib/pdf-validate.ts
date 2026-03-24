/**
 * USPTO PDF Compliance Validator
 *
 * USPTO Patent Center accepts: PDF versions 1.4 through 1.7 only.
 * PDF 2.0 and PDF 1.0–1.3 are rejected at upload.
 * Password-protected PDFs are also rejected.
 *
 * File size limits (USPTO): 25 MB per file (spec or figures).
 *
 * Usage:
 *   const result = validatePDFBuffer(buffer, filename)
 *   if (!result.valid) return NextResponse.json({ error: result.error }, { status: 400 })
 */

export interface PDFValidationResult {
  valid: boolean
  version?: string      // e.g. "1.7"
  error?: string        // human-readable error for API response
  isEncrypted?: boolean
}

/** Max file size USPTO accepts for spec/figures uploads (25 MB) */
export const USPTO_PDF_MAX_BYTES = 25 * 1024 * 1024

/**
 * Validate a PDF buffer for USPTO Patent Center compatibility.
 * Checks: valid PDF header, version 1.4–1.7, no encryption, file size ≤ 25 MB.
 */
export function validatePDFBuffer(
  buffer: Buffer,
  filename: string
): PDFValidationResult {
  // ── Size check ──────────────────────────────────────────────────────────────
  if (buffer.byteLength > USPTO_PDF_MAX_BYTES) {
    const mb = (buffer.byteLength / 1024 / 1024).toFixed(1)
    return {
      valid: false,
      error: `File too large (${mb} MB). USPTO Patent Center accepts a maximum of 25 MB per file.`,
    }
  }

  // ── PDF header check ────────────────────────────────────────────────────────
  const headerBytes = buffer.slice(0, 16).toString('latin1')
  if (!headerBytes.startsWith('%PDF-')) {
    return {
      valid: false,
      error: `"${filename}" does not appear to be a valid PDF file. Please upload a valid PDF.`,
    }
  }

  // ── Version extraction ──────────────────────────────────────────────────────
  // Header format: %PDF-X.Y\n — we read the first 12 bytes
  const versionMatch = headerBytes.match(/%PDF-(\d+)\.(\d+)/)
  if (!versionMatch) {
    return {
      valid: false,
      error: `"${filename}" has an unreadable PDF version header. Please re-export the PDF using a standard tool.`,
    }
  }
  const major = parseInt(versionMatch[1], 10)
  const minor = parseInt(versionMatch[2], 10)
  const version = `${major}.${minor}`

  // USPTO accepts: PDF 1.4, 1.5, 1.6, 1.7
  if (major !== 1 || minor < 4 || minor > 7) {
    const guidance = major >= 2
      ? 'PDF 2.0 is not accepted by USPTO. Please re-export as PDF 1.7 using Adobe Acrobat, Microsoft Word, or Google Chrome Print → Save as PDF.'
      : minor < 4
        ? `PDF ${version} is too old. USPTO requires PDF 1.4–1.7. Please re-export using a modern application.`
        : `PDF ${version} is not accepted. USPTO requires PDF 1.4–1.7.`
    return { valid: false, version, error: guidance }
  }

  // ── Encryption / password protection check ──────────────────────────────────
  // Scan first 4 KB for /Encrypt dictionary entry (covers all standard encrypted PDFs)
  const scanLength = Math.min(buffer.byteLength, 4096)
  const pdfHead = buffer.slice(0, scanLength).toString('latin1')
  if (pdfHead.includes('/Encrypt')) {
    return {
      valid: false,
      version,
      isEncrypted: true,
      error: `"${filename}" is password-protected or encrypted. USPTO does not accept encrypted PDFs. Please remove password protection (File → Properties → Security in Adobe Acrobat) before uploading.`,
    }
  }

  return { valid: true, version }
}
