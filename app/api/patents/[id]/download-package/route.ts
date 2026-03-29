import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { USPTO_FEES } from '@/lib/uspto-fees'
import { buildCoverSheetPdf } from '@/lib/cover-sheet-pdf'
import { buildSpecPdf } from '@/lib/spec-pdf'
import { getUserTierInfo, isPro, tierRequiredResponse } from '@/lib/tier'
import { sanitizeForUspto } from '@/lib/text-sanitize'

export const maxDuration = 60

type Scenario = 'provisional_filing' | 'assignment' | 'non_provisional_prep'

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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

// ── README content per scenario ──────────────────────────────────────────────

function buildReadme(scenario: Scenario, patent: Record<string, unknown>, hasSpec: boolean, hasClaims: boolean, hasFigures: boolean): string {
  const title = (patent.title as string) ?? 'Untitled Patent'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const header = `
USPTO FILING PACKAGE
====================
Patent: ${title}
Package Type: ${scenario.replace(/_/g, ' ').toUpperCase()}
Generated: ${today} by PatentPending.app

⚠️  DISCLAIMER: PatentPending.app is not a law firm. This package does not constitute
legal advice. Consult a registered patent attorney or agent before filing.

`

  if (scenario === 'provisional_filing') {
    return header + `
PROVISIONAL APPLICATION FILING PACKAGE
---------------------------------------
This package contains the documents needed to file a provisional patent application
with the USPTO Patent Center (patentcenter.uspto.gov).

PATENT CENTER COMPATIBILITY: All files in this package have been tested against
USPTO Patent Center requirements. See filing steps below.

DOCUMENTS IN THIS PACKAGE:
  01-cover-sheet-ADS-REFERENCE.pdf
                           — ADS Reference Card (DO NOT UPLOAD — enter fields manually)
                             USPTO Patent Center only accepts the official Adobe LiveCycle
                             XFA form for ADS upload. Use this PDF to READ the fields,
                             then enter them in Patent Center's "Fill out form online" option.
                             All major e-filing tools handle ADS the same way.

  02-specification.pdf     — Specification + Claims + Abstract (USPTO-compliant PDF, 37 CFR 1.52)
                             Status: ${hasSpec ? 'Specification present' : 'MISSING spec — complete Step 5 first'}
                                     ${hasClaims ? 'Claims present' : 'MISSING claims — generate in PatentPending.app'}
                             Upload as document type: "Specification" in Patent Center
                             Contains: Spec sections, CLAIMS, and ABSTRACT (if entered)
                             Format: 12pt Helvetica, 1.5x spacing, 1" margins — USPTO letter format

  04-drawings.pdf          — All figures combined into single PDF
                             Status: ${hasFigures ? 'Figures present' : 'Not yet generated (optional for provisional)'}
                             Upload as document type: "Drawings" in Patent Center
                             All figures at 300 DPI, greyscale, USPTO-acceptable

STEP-BY-STEP FILING GUIDE:
  (Full interactive guide available in the PatentPending.app Filings tab)

  Step 1: Go to patentcenter.uspto.gov
          New Application -> Provisional Application

  Step 2: Application Data Sheet (ADS)
          Click "Change ADS filing method" -> "Fill out form online"
          Use 01-cover-sheet-ADS-REFERENCE.pdf to copy fields into the web form:
          - Title: your invention title
          - Inventor: name, address, citizenship
          - Entity status: check Small Entity (saves 50% on fees)
          - Application type: Provisional
          Click "Add to Documents"

  Step 3: Upload Specification
          Add Document -> browse to 02-specification.pdf
          Document type: Specification
          Click "Add to Documents"

  Step 4: Upload Drawings (if present)
          Add Document -> browse to 04-drawings.pdf
          Document type: Drawings
          Click "Add to Documents"

  Step 5: Foreign Filing checkboxes
          "Submitting under 35 USC 111(b)" -> YES (provisional)
          All foreign filing checkboxes -> NO (unless you filed abroad first)

  Step 6: Pay filing fee
          Small Entity Provisional: $${USPTO_FEES.provisional.small}
          Micro Entity Provisional: $${USPTO_FEES.provisional.micro}
          Large Entity: $${USPTO_FEES.provisional.large}

  Step 7: Download filing receipt
          Save your confirmation. Come back to PatentPending and click "Mark as Filed"
          to record your provisional application number and start your 12-month clock.

FILING FEES (USPTO Fee Schedule, effective Jan 19, 2025):
  Micro entity: $${USPTO_FEES.provisional.micro}
  Small entity: $${USPTO_FEES.provisional.small}
  Large entity: $${USPTO_FEES.provisional.large}

IMPORTANT:
  • Your non-provisional must be filed within 12 months of the provisional
  • The provisional filing date becomes your patent priority date
  • Keep the USPTO confirmation email and application number

`
  }

  if (scenario === 'assignment') {
    return header + `
ASSIGNMENT PACKAGE
------------------
This package contains template documents for recording patent assignment
and inventor declaration with the USPTO.

⚠️ These are TEMPLATES — they require customization by an attorney
   or careful review before execution and recording.

DOCUMENTS:
  01-assignment-agreement-TEMPLATE.txt — Patent Assignment Agreement
                                          ACTION: Review all [BRACKETED] fields,
                                          have all parties sign, then record with USPTO
                                          Fee: ~$40 to record at USPTO (e-recording)

  02-inventor-declaration-TEMPLATE.txt — Inventor Declaration (37 CFR 1.63)
                                          ACTION: Inventor must sign and date
                                          Required for non-provisional applications

ASSIGNMENT RECORDING STEPS:
  1. Customize the assignment agreement with legal names, addresses, consideration
  2. Have all parties sign (inventor and assignee)
  3. Notarize if required by your state
  4. Record at USPTO Electronic Patent Assignment (EPA): assignments.uspto.gov
  5. Pay recording fee (~$40)

INVENTOR DECLARATION:
  • Required when filing a non-provisional application
  • Inventor must personally sign — no proxy
  • Must reference the patent application number

`
  }

  if (scenario === 'non_provisional_prep') {
    return header + `
NON-PROVISIONAL PREPARATION PACKAGE
--------------------------------------
This package contains documents for filing your non-provisional patent application.
A non-provisional is the full patent application that can result in a granted patent.

⚠️ NON-PROVISIONAL APPLICATIONS ARE COMPLEX. Consider hiring a registered
   patent attorney or agent (USPTO.gov/patent-attorney-or-agent-search).

REQUIRED DOCUMENTS:
  01-cover-sheet-ADS.pdf   — Application Data Sheet (ADS) — PDF 1.7, USPTO compliant
                             Auto-filled. Must reference your provisional app number.
                             ⚠️ Confirm "Prior Application Number" field is correct

  02-specification.txt     — Full Written Description
                             Status: ${hasSpec ? '✅ Present' : '⚠️ MISSING'}
                             For non-provisional, this must be COMPLETE and EXACT
                             USPTO requirements: 37 CFR 1.71

  03-claims.txt            — Patent Claims (the legal scope of your patent)
                             Status: ${hasClaims ? '✅ Present' : '⚠️ MISSING'}
                             Non-provisional claims receive full examination
                             USPTO note: Must include at least one independent claim

OPTIONAL DOCUMENTS:
  figures/                 — Patent Drawings (300 DPI PNG, USPTO minimum met)
                             Status: ${hasFigures ? '✅ Present' : '⚠️ Not generated'}
                             All figures exported at 300 DPI, greyscale, lossless PNG
                             Margins: 1" top/right, 3/8" sides/bottom — verify before uploading

ALSO REQUIRED (not in this package):
  • Abstract (max 150 words) — generate in PatentPending.app
  • Inventor Declaration (37 CFR 1.63)
  • Filing fees — non-provisional total: ~$${USPTO_FEES.nonProvisional.total.micro} micro / ~$${USPTO_FEES.nonProvisional.total.small} small / ~$${USPTO_FEES.nonProvisional.total.large.toLocaleString()} large entity
  • IDS (Information Disclosure Statement) if you know of prior art

NON-PROVISIONAL FILING NOTES:
  • File via USPTO Patent Center: patentcenter.uspto.gov
  • Claim priority to your provisional using ADS Section 5
  • The 12-month window from provisional filing date is your deadline
  • USPTO examination takes 2-3 years on average

`
  }

  return header
}

// ── Assignment agreement template ─────────────────────────────────────────────

function buildAssignmentTemplate(patent: Record<string, unknown>): string {
  const title = (patent.title as string) ?? 'Untitled Patent'
  const inventors = ((patent.inventors as string[]) ?? []).join(', ') || '[INVENTOR FULL NAME]'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return `PATENT ASSIGNMENT AGREEMENT
============================
⚠️ TEMPLATE — All [BRACKETED] fields must be completed before execution.
    Consult a patent attorney before signing.

Date: ${today}

ASSIGNOR: ${inventors}
Address: [ASSIGNOR STREET ADDRESS, CITY, STATE, ZIP]

ASSIGNEE: [ASSIGNEE ENTITY NAME — e.g. Hot Hands IP, LLC]
Address: [ASSIGNEE STREET ADDRESS, CITY, STATE, ZIP]

PATENT SUBJECT TO ASSIGNMENT:
  Title: ${title}
  Application No.: [PROVISIONAL APP NUMBER, e.g. 63/000,000]
  Filing Date: [MM/DD/YYYY]
  Country: United States

CONSIDERATION:
  For good and valuable consideration, the receipt and sufficiency of which is
  hereby acknowledged, Assignor hereby assigns to Assignee all right, title,
  and interest in and to the above-identified patent application, including:

  (a) the patent application itself and all inventions described therein;
  (b) all patents issued or issuable therefrom, including continuations,
      continuations-in-part, divisionals, reissues, and reexaminations;
  (c) the right to sue for past, present, and future infringement;
  (d) all rights to claim priority in any jurisdiction worldwide.

REPRESENTATIONS AND WARRANTIES:
  Assignor represents and warrants that:
  (a) Assignor is the sole/joint inventor of the described invention;
  (b) Assignor has the full right to assign as set forth herein;
  (c) The invention has not been previously assigned to any third party.

FURTHER ASSURANCES:
  Assignor agrees to execute all documents reasonably requested by Assignee
  to perfect or confirm the assignment, including USPTO recordal documents.

GOVERNING LAW: State of [STATE], United States

SIGNATURES:

Assignor: _______________________________    Date: ________________
           ${inventors}
           (Printed Name)

Assignee: _______________________________    Date: ________________
           [AUTHORIZED SIGNATORY NAME]
           (Title: [CEO / Manager / Partner])
           On behalf of: [ASSIGNEE ENTITY NAME]


NOTE: Record this assignment at the USPTO Electronic Patent Assignment (EPA):
assignments.uspto.gov — Filing fee: ~$40
`
}

// ── Inventor declaration template ─────────────────────────────────────────────

function buildDeclarationTemplate(patent: Record<string, unknown>): string {
  const title = (patent.title as string) ?? 'Untitled Patent'
  const inventors = ((patent.inventors as string[]) ?? []).join(', ') || '[INVENTOR FULL NAME]'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return `DECLARATION FOR UTILITY OR DESIGN PATENT APPLICATION
(37 CFR 1.63)
======================================================
⚠️ TEMPLATE — Fill in all [BRACKETED] fields before signing.
    This document must be signed by each inventor personally.

As the below-named inventor, I hereby declare that:

(1) I am an original inventor of or an original joint inventor of the claimed
    invention in the attached application, titled:

    "${title}"

(2) The application was made or authorized to be made by me.

(3) I believe I am the original inventor or an original joint inventor of a
    claimed invention in the application.

INVENTOR 1:
  Full Legal Name: ${inventors}
  Mailing Address: [STREET ADDRESS]
  City: [CITY]   State: [STATE]   Zip: [ZIP]
  Country of Citizenship: [e.g. US]
  Date of Birth: [MM/DD/YYYY] (optional, not required by USPTO)

ACKNOWLEDGMENT:
  I hereby acknowledge that any willful false statement made in this declaration
  is punishable under 18 U.S.C. 1001 by fine or imprisonment of not more than
  five (5) years, or both.

SIGNATURE:

________________________     Date: _________________
Inventor Signature

${inventors}
(Printed Name)


APPLICATION INFORMATION:
  Application Number: [ASSIGNED BY USPTO UPON FILING]
  Filing Date: [MM/DD/YYYY — AS FILED]

INSTRUCTIONS:
  • This declaration is required for non-provisional applications
  • File with the application or within the time period set by USPTO
  • For joint inventors, each inventor must sign a separate copy
  • Do not sign until you have read the full specification and claims

Generated: ${today} by PatentPending.app
PatentPending.app is not a law firm. This is not legal advice.
`
}

// ── Main handler ──────────────────────────────────────────────────────────────

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
    let scenario: Scenario = 'provisional_filing'
    try {
      const body = await req.json()
      if (['provisional_filing', 'assignment', 'non_provisional_prep'].includes(body.scenario)) {
        scenario = body.scenario
      }
    } catch { /* default to provisional_filing */ }

    console.log(`[ZIP] user=${user.id} patent=${patentId} scenario=${scenario}`)

    // ── Fetch patent ────────────────────────────────────────────────────────────
    const { data: patent } = await supabaseService
      .from('patents')
      .select('id, owner_id, title, inventors, provisional_number, application_number, filing_date, spec_draft, claims_draft, abstract_draft, spec_uploaded, figures_uploaded, cover_sheet_acknowledged, entity_status, provisional_app_number, provisional_filed_at')
      .eq('id', patentId)
      .single()

    if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
    if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // ── Tier gate: zip download requires Pro ──────────────────────────────────
    const tierInfo = await getUserTierInfo(user.id)
    console.log(`[ZIP] tier=${tierInfo.subscription_status} is_attorney=${tierInfo.is_attorney}`)
    if (!isPro(tierInfo, { isOwner: true, feature: 'zip_download' })) {
      return tierRequiredResponse('zip_download')
    }

    // ── Hard block: claims required for filing packages (not assignment templates) ──
    if (scenario !== 'assignment') {
      console.log(`[ZIP] claims value: ${JSON.stringify(patent.claims_draft)?.slice(0, 200)}`)
      if (!patent.claims_draft || (patent.claims_draft as string).trim().length === 0) {
        return NextResponse.json({
          error: 'Cannot generate filing package: no claims on record. Generate and approve claims in PatentPending first.',
          code: 'NO_CLAIMS',
        }, { status: 400 })
      }
    }

    // ── Fetch user profile for cover sheet ───────────────────────────────────
    const { data: profile } = await supabaseService
      .from('patent_profiles')
      .select('name_first, name_middle, name_last, address_line_1, city, state, zip, country, phone, email, uspto_customer_number, default_assignee_name, default_assignee_address')
      .eq('id', user.id)
      .single()

    // ── Build ZIP ─────────────────────────────────────────────────────────────
    const zip = new JSZip()
    const dateStr = new Date().toISOString().split('T')[0]
    const folderName = `${slugify(patent.title ?? 'patent')}-${scenario.replace(/_/g, '-')}-${dateStr}`
    const folder = zip.folder(folderName)!

    const hasSpec = !!(patent.spec_draft)
    const hasClaims = !!(patent.claims_draft)
    const hasFigures = !!(patent.figures_uploaded)

    // ── README ────────────────────────────────────────────────────────────────
    folder.file('README.txt', buildReadme(scenario, patent as Record<string, unknown>, hasSpec, hasClaims, hasFigures))

    // ── Scenario: provisional_filing / non_provisional_prep ──────────────────
    // ── Helper: convert array of PNG buffers → single multi-page PDF ─────────
    async function figuresToPdf(figurePngs: { name: string; buf: Buffer }[]): Promise<Buffer> {
      const pdfDoc = await PDFDocument.create()
      for (const fig of figurePngs) {
        try {
          const img = await pdfDoc.embedPng(fig.buf)
          // Scale to letter (8.5" × 11" = 612 × 792 pt) keeping aspect ratio
          const maxW = 612, maxH = 792
          const scale = Math.min(maxW / img.width, maxH / img.height, 1)
          const w = img.width * scale
          const h = img.height * scale
          const page = pdfDoc.addPage([maxW, maxH])
          // Center on page
          page.drawImage(img, { x: (maxW - w) / 2, y: (maxH - h) / 2, width: w, height: h })
        } catch (e) {
          console.error(`[ZIP] figuresToPdf: could not embed ${fig.name}:`, e)
        }
      }
      return Buffer.from(await pdfDoc.save())
    }

    if (scenario === 'provisional_filing' || scenario === 'non_provisional_prep') {
      // Cover sheet — server-side PDF (USPTO-compliant PDF 1.7, pdf-lib)
      // Wrapped in try/catch: if PDF generation fails, include a plaintext fallback
      try {
        const coverPdfBytes = await buildCoverSheetPdf(
          patent as Record<string, unknown>,
          profile as Record<string, unknown> | null
        )
        // Provisional: label as reference card — do not upload to Patent Center
        const adsFilename = scenario === 'provisional_filing'
          ? '01-cover-sheet-ADS-REFERENCE.pdf'
          : '01-cover-sheet-ADS.pdf'
        folder.file(adsFilename, coverPdfBytes)
        console.log('[ZIP] cover sheet PDF generated OK')
      } catch (coverErr) {
        console.error('[ZIP] cover-sheet PDF generation failed:', coverErr)
        // Fallback: plaintext ADS placeholder — user can fill in manually
        folder.file('01-cover-sheet-FALLBACK.txt', [
          'COVER SHEET (ADS) — GENERATION FAILED',
          '',
          `Title: ${patent.title ?? ''}`,
          `Provisional Number: ${patent.provisional_number ?? ''}`,
          `Filing Date: ${patent.filing_date ?? ''}`,
          '',
          'The PDF generator encountered an error. Please fill in the ADS manually at:',
          'https://patentcenter.uspto.gov (use form PTO/AIA/14)',
          '',
          `Error: ${coverErr instanceof Error ? coverErr.message : String(coverErr)}`,
        ].join('\n'))
      }

      // Specification + Claims (format depends on scenario)
      if (scenario === 'provisional_filing') {
        // Provisional: spec + claims + abstract as USPTO-compliant PDF (37 CFR 1.52).
        // Patent Center accepts PDF for "Specification" document type.
        // All three sections (spec, claims, abstract) are combined in one file per USPTO convention.
        try {
          const specPdfBytes = await buildSpecPdf({
            title: patent.title as string ?? '',
            spec_draft: patent.spec_draft as string | null,
            claims_draft: patent.claims_draft as string | null,
            abstract_draft: (patent as Record<string, unknown>).abstract_draft as string | null,
          })
          folder.file('02-specification.pdf', specPdfBytes)
          console.log(`[ZIP] provisional: spec PDF generated (${specPdfBytes.byteLength} bytes)`)
        } catch (specPdfErr) {
          console.error('[ZIP] spec PDF generation failed — falling back to txt:', specPdfErr)
          // Fallback: combined ASCII text (Patent Center may not accept but preserves content)
          const { sanitizeForUspto } = await import('@/lib/text-sanitize')
          const specText    = sanitizeForUspto((patent.spec_draft as string) ?? '')
          const claimsText  = sanitizeForUspto((patent.claims_draft as string) ?? '')
          const abstractText = (patent as Record<string, unknown>).abstract_draft
            ? sanitizeForUspto(((patent as Record<string, unknown>).abstract_draft) as string)
            : ''
          const parts = [
            specText.trim() ? specText : 'SPECIFICATION NOT YET GENERATED',
            '',
            '================================================================================',
            'CLAIMS',
            '================================================================================',
            '',
            claimsText.trim() ? claimsText : 'CLAIMS NOT YET GENERATED',
          ]
          if (abstractText.trim()) {
            parts.push('', '================================================================================', 'ABSTRACT', '================================================================================', '', abstractText)
          }
          folder.file('02-specification-FALLBACK.txt', parts.join('\n'))
          console.log('[ZIP] fallback: combined spec+claims+abstract txt')
        }
      } else {
        // Non-provisional / other: separate files (Patent Center accepts both)
        if (patent.spec_draft) {
          folder.file('02-specification.txt', sanitizeForUspto(patent.spec_draft as string))
        } else {
          folder.file('02-specification-MISSING.txt', 'SPECIFICATION NOT YET GENERATED\n\nComplete Step 5 in PatentPending.app first.')
        }
        if (patent.claims_draft) {
          folder.file('03-claims.txt', sanitizeForUspto(patent.claims_draft as string))
        } else {
          folder.file('03-claims-MISSING.txt', 'CLAIMS NOT YET GENERATED\n\nGenerate and approve claims in PatentPending.app first.')
        }
      }

      // Abstract (bonus — non-provisional only; not needed for provisionals)
      if (scenario !== 'provisional_filing' && patent.abstract_draft) {
        folder.file('04-abstract.txt', sanitizeForUspto(patent.abstract_draft as string))
      }

      // Figures — download + process via Sharp, then:
      //   Provisional:     combine into single 04-drawings.pdf (Patent Center requires PDF or TIFF)
      //   Non-provisional: individual PNGs in figures/ folder (or also PDF — same path)
      if (patent.figures_uploaded) {
        const { data: aiList } = await supabaseService.storage
          .from('patent-uploads')
          .list(`${patentId}/figures`, { limit: 20 })
        const aiFiles = (aiList ?? []).filter(f => f.name.match(/^fig\d+\.(svg|png|jpg|jpeg)$/i))

        const { data: userList } = await supabaseService.storage
          .from('patent-uploads')
          .list(`${user.id}/${patentId}/figures`, { limit: 20 })
        const userFiles = (userList ?? []).filter(f => f.name.match(/\.(svg|png|jpg|jpeg)$/i))

        const allFigs = [
          ...aiFiles.map(f => ({ path: `${patentId}/figures/${f.name}`, name: f.name })),
          ...userFiles.map(f => ({ path: `${user.id}/${patentId}/figures/${f.name}`, name: f.name })),
        ]

        // Sort: fig1, fig2, ... so PDF page order matches figure numbers
        allFigs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

        console.log(`[ZIP] processing ${allFigs.length} figures`)

        // Collect processed PNGs for potential PDF combining
        const processedPngs: { name: string; buf: Buffer }[] = []

        for (const fig of allFigs) {
          try {
            const { data: signed } = await supabaseService.storage
              .from('patent-uploads')
              .createSignedUrl(fig.path, 300)
            if (!signed?.signedUrl) continue

            const res = await fetch(signed.signedUrl)
            if (!res.ok) continue
            const rawBuf = Buffer.from(await res.arrayBuffer())

            const isSvg = fig.name.toLowerCase().endsWith('.svg')
            let pngBuf: Buffer

            if (isSvg) {
              pngBuf = await sharp(rawBuf, { density: 300 })
                .resize({ width: 2550, height: 3300, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                .greyscale()
                .png({ compressionLevel: 9 })
                .toBuffer()
            } else {
              pngBuf = await sharp(rawBuf)
                .withMetadata({ density: 300 })
                .greyscale()
                .png({ compressionLevel: 9 })
                .toBuffer()
            }

            processedPngs.push({ name: fig.name, buf: pngBuf })
          } catch (e) {
            console.error(`[ZIP] figure processing error for ${fig.name}:`, e)
            // Fallback: download original and add to list
            try {
              const { data: signed } = await supabaseService.storage
                .from('patent-uploads')
                .createSignedUrl(fig.path, 300)
              if (signed?.signedUrl) {
                const res = await fetch(signed.signedUrl)
                if (res.ok) {
                  const rawBuf = Buffer.from(await res.arrayBuffer())
                  processedPngs.push({ name: fig.name, buf: rawBuf })
                  console.log(`[ZIP] figure ${fig.name}: included original (Sharp failed)`)
                }
              }
            } catch {
              console.error(`[ZIP] figure ${fig.name}: fallback also failed, skipping`)
            }
          }
        }

        if (processedPngs.length > 0) {
          // Always produce 04-drawings.pdf (Patent Center accepts PDF for drawings)
          // Non-provisional also gets individual PNGs in figures/ for reference
          try {
            const drawingsPdf = await figuresToPdf(processedPngs)
            folder.file('04-drawings.pdf', drawingsPdf)
            console.log(`[ZIP] figures → 04-drawings.pdf (${processedPngs.length} pages, ${drawingsPdf.length} bytes)`)
          } catch (pdfErr) {
            console.error('[ZIP] figuresToPdf failed, falling back to individual PNGs:', pdfErr)
            const figuresFolder = folder.folder('figures')!
            for (const f of processedPngs) {
              const outName = f.name.replace(/\.(svg|jpg|jpeg)$/i, '.png')
              figuresFolder.file(outName, f.buf)
            }
          }

          // Non-provisional prep: also include individual PNGs for attorney review
          if (scenario === 'non_provisional_prep') {
            const figuresFolder = folder.folder('figures-reference')!
            for (const f of processedPngs) {
              const outName = f.name.replace(/\.(svg|jpg|jpeg)$/i, '.png')
              figuresFolder.file(outName, f.buf)
            }
          }
        }
      }
    }

    // ── Scenario: assignment ──────────────────────────────────────────────────
    if (scenario === 'assignment') {
      folder.file('01-assignment-agreement-TEMPLATE.txt', buildAssignmentTemplate(patent as Record<string, unknown>))
      folder.file('02-inventor-declaration-TEMPLATE.txt', buildDeclarationTemplate(patent as Record<string, unknown>))
    }

    // ── Generate ZIP buffer ───────────────────────────────────────────────────
    // Use 'arraybuffer' type — returns plain ArrayBuffer (not ArrayBufferLike),
    // which is a valid BlobPart without TypeScript narrowing issues.
    const zipArrayBuffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    console.log(`[ZIP] generated OK — ${zipArrayBuffer.byteLength} bytes`)

    const zipBlob = new Blob([zipArrayBuffer], { type: 'application/zip' })
    const filename = `${folderName}.zip`

    return new Response(zipBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipArrayBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })

  } catch (error) {
    console.error('[ZIP] unhandled error:', error)
    return NextResponse.json({
      error: `Failed to generate ZIP package: ${error instanceof Error ? error.message : 'Unknown error'}`,
      code: 'ZIP_ERROR',
    }, { status: 500 })
  }
}
