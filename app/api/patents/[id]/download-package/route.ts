import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

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

REQUIRED DOCUMENTS:
  01-cover-sheet.html      — Application Data Sheet (ADS)
                             ACTION: Open in browser → Print → Save as PDF
                             USPTO Form: PTO/AIA/14 (37 CFR 1.76)
                             ⚠️ Fill in any blank fields before printing

  02-specification.txt     — Written Description of Your Invention
                             Status: ${hasSpec ? '✅ Present' : '⚠️ MISSING — complete Step 5 in PatentPending.app'}
                             REQUIRED by USPTO (35 U.S.C. § 112)
                             Contains: Field, Background, Summary, Detailed Description

  03-claims.txt            — Patent Claims
                             Status: ${hasClaims ? '✅ Present' : '⚠️ MISSING — generate claims in PatentPending.app'}
                             REQUIRED by USPTO for provisional
                             Independent + dependent claims included

OPTIONAL DOCUMENTS:
  figures/                 — Patent Drawings / Figures
                             Status: ${hasFigures ? '✅ Present' : '⚠️ Not yet generated'}
                             USPTO note: Figures should be black and white line art
                             at 300 DPI minimum. PDF format preferred for USPTO upload.
                             SVG files are vector format — convert to PDF for filing.

FILING STEPS:
  1. Open 01-cover-sheet.html in Chrome → File → Print → Save as PDF
  2. Review and edit all blank fields in the cover sheet
  3. Go to patentcenter.uspto.gov and create/log into your account
  4. Start a new provisional application (Application Type: Provisional)
  5. Upload: ADS PDF, specification .txt (or convert to PDF), claims .txt, figures
  6. Pay filing fee (~$320 micro entity, ~$640 small entity, ~$1,600 undiscounted)
  7. Save your filing receipt — it confirms your priority date

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
  01-cover-sheet.html      — Application Data Sheet (ADS)
                             ACTION: Open in browser → Print → Save as PDF
                             Must reference your provisional app number for priority
                             ⚠️ Update "Prior Application Number" field with provisional #

  02-specification.txt     — Full Written Description
                             Status: ${hasSpec ? '✅ Present' : '⚠️ MISSING'}
                             For non-provisional, this must be COMPLETE and EXACT
                             USPTO requirements: 37 CFR 1.71

  03-claims.txt            — Patent Claims (the legal scope of your patent)
                             Status: ${hasClaims ? '✅ Present' : '⚠️ MISSING'}
                             Non-provisional claims receive full examination
                             USPTO note: Must include at least one independent claim

OPTIONAL DOCUMENTS:
  figures/                 — Patent Drawings
                             Status: ${hasFigures ? '✅ Present' : '⚠️ Not generated'}
                             For non-provisional: must be USPTO-compliant
                             Black and white line art, 300 DPI minimum
                             Margins: 1" top/right, 3/8" sides/bottom

ALSO REQUIRED (not in this package):
  • Abstract (max 150 words) — generate in PatentPending.app
  • Inventor Declaration (37 CFR 1.63)
  • Filing fees (~$800 micro entity, ~$1,600 small, ~$4,000 undiscounted for non-provisional)
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

// ── Cover sheet HTML generator ────────────────────────────────────────────────

function buildCoverSheetHtml(patent: Record<string, unknown>, profile: Record<string, unknown> | null): string {
  const title = (patent.title as string) ?? ''
  const provisional_number = (patent.provisional_number as string) ?? ''
  const filing_date = (patent.filing_date as string) ?? ''
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const todayLong = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const firstName = (profile?.name_first as string) ?? ''
  const middleName = (profile?.name_middle as string) ?? ''
  const lastName = (profile?.name_last as string) ?? ''
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ')
  const inventors = (patent.inventors as string[]) ?? []
  const inventorName = fullName || inventors[0] || '___________________'

  const address1 = (profile?.address_line_1 as string) ?? '___________________'
  const city = (profile?.city as string) ?? '___________________'
  const state = (profile?.state as string) ?? '__'
  const zip = (profile?.zip as string) ?? '_____'
  const country = (profile?.country as string) ?? 'US'
  const phone = (profile?.phone as string) ?? '___________________'
  const email = (profile?.email as string) ?? '___________________'
  const customerNum = (profile?.uspto_customer_number as string) ?? ''
  const assigneeName = (profile?.default_assignee_name as string) ?? ''
  const assigneeAddress = (profile?.default_assignee_address as string) ?? ''

  const sigFull = fullName || inventorName
  const signature = `/${sigFull}/`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>ADS Cover Sheet — ${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');
    body { font-family: Georgia,"Times New Roman",serif; max-width:750px; margin:2rem auto; padding:0 2rem; color:#111; font-size:11pt; }
    h1 { text-align:center; font-size:15pt; text-transform:uppercase; letter-spacing:2px; border-bottom:2px solid #000; padding-bottom:10px; }
    .subtitle { text-align:center; font-size:10pt; color:#555; margin-top:4px; }
    .warning { background:#fffbe6; border:1px solid #e6a000; border-radius:4px; padding:8px 12px; font-size:9pt; color:#7a4a00; margin:12px 0 18px; font-family:Arial,sans-serif; }
    h2 { font-size:10pt; font-family:Arial,sans-serif; text-transform:uppercase; letter-spacing:1.5px; border-bottom:1px solid #555; padding-bottom:3px; margin-top:22px; color:#222; }
    .field { margin-bottom:12px; }
    .label { font-size:8.5pt; font-family:Arial,sans-serif; text-transform:uppercase; letter-spacing:1px; color:#666; font-weight:bold; margin-bottom:2px; }
    .value { border-bottom:1.5px solid #333; min-height:22px; padding-bottom:2px; font-size:10.5pt; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px 20px; }
    .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px 16px; }
    .disabled { color:#bbb; }
    .sig-value { font-family:'Dancing Script','Brush Script MT',cursive; font-size:17pt; font-style:italic; border-bottom:1.5px solid #333; min-height:28px; }
    .footer { margin-top:30px; border-top:1px solid #ccc; padding-top:10px; font-size:8.5pt; font-family:Arial,sans-serif; color:#888; text-align:center; }
    .checkbox { font-size:12pt; font-weight:bold; margin-right:6px; }
    @media print { .warning { display:none; } @page { margin:0.75in; } }
  </style>
</head>
<body>
  <p class="subtitle" style="margin:0;font-size:9pt;color:#666;font-family:Arial,sans-serif;text-align:center">United States Patent and Trademark Office</p>
  <h1>Application Data Sheet</h1>
  <p class="subtitle">37 CFR 1.76 &nbsp;·&nbsp; Generated ${todayLong} by PatentPending.app</p>

  <div class="warning">
    ⚠️ <strong>DRAFT</strong> — Review all fields before filing. Fill in any blank lines.
    File at <strong>patentcenter.uspto.gov</strong>. PatentPending.app is not a law firm.
  </div>

  <h2>1. Application Information</h2>
  <div class="field"><div class="label">Title of Invention</div><div class="value">${title || '___________________'}</div></div>
  <div class="grid2">
    <div class="field"><div class="label">Application Number</div><div class="value disabled">Assigned by USPTO upon filing</div></div>
    <div class="field"><div class="label">Filing Date</div><div class="value disabled">Assigned by USPTO</div></div>
    <div class="field"><div class="label">Attorney Docket Number</div><div class="value">&nbsp;</div></div>
    <div class="field"><div class="label">Customer Number</div><div class="value">${customerNum || '___________________'}</div></div>
  </div>

  <h2>2. Inventor Information</h2>
  <div style="border-left:2px solid #999;padding-left:14px;margin-bottom:8px">
    <div style="font-size:8.5pt;font-family:Arial,sans-serif;font-weight:bold;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Inventor 1 — First Named Inventor</div>
    <div class="grid3">
      <div class="field"><div class="label">Given Name</div><div class="value">${firstName || '___________________'}</div></div>
      <div class="field"><div class="label">Middle Name</div><div class="value">${middleName || '___________________'}</div></div>
      <div class="field"><div class="label">Family Name</div><div class="value">${lastName || '___________________'}</div></div>
    </div>
    <div class="grid2">
      <div class="field"><div class="label">Street Address</div><div class="value">${address1}</div></div>
      <div class="field"><div class="label">City</div><div class="value">${city}</div></div>
    </div>
    <div class="grid3">
      <div class="field"><div class="label">State</div><div class="value">${state}</div></div>
      <div class="field"><div class="label">Postal Code</div><div class="value">${zip}</div></div>
      <div class="field"><div class="label">Country</div><div class="value">${country}</div></div>
    </div>
    <div class="grid2">
      <div class="field"><div class="label">Telephone</div><div class="value">${phone}</div></div>
      <div class="field"><div class="label">Email</div><div class="value">${email}</div></div>
    </div>
    <div class="field"><div class="label">Citizenship</div><div class="value">United States</div></div>
  </div>

  <h2>3. Correspondence Information</h2>
  <div class="grid2">
    <div class="field"><div class="label">Given Name</div><div class="value">${firstName || '___________________'}</div></div>
    <div class="field"><div class="label">Family Name</div><div class="value">${lastName || '___________________'}</div></div>
  </div>
  <div class="field"><div class="label">Organization / Firm</div><div class="value">Pro Se (self-represented)</div></div>
  <div class="field"><div class="label">Street Address</div><div class="value">${address1}</div></div>
  <div class="grid3">
    <div class="field"><div class="label">City</div><div class="value">${city}</div></div>
    <div class="field"><div class="label">State</div><div class="value">${state}</div></div>
    <div class="field"><div class="label">Postal Code</div><div class="value">${zip}</div></div>
  </div>

  <h2>4. Application Type / Entity Status</h2>
  <p style="font-size:10.5pt;margin:8px 0"><span class="checkbox">■</span> Provisional Application under 35 U.S.C. 111(b)</p>
  <p style="font-size:9pt;font-family:Arial,sans-serif;color:#555;margin:4px 0 8px">Entity Status (check one):</p>
  <p><span class="checkbox">☐</span> <strong>Micro Entity</strong> — 37 CFR 1.29 · ~80% fee discount</p>
  <p><span class="checkbox">☑</span> <strong>Small Entity</strong> — 37 CFR 1.27 · ~60% fee discount</p>
  <p><span class="checkbox">☐</span> <strong>Undiscounted</strong> (Large Entity)</p>

  <h2>5. Prior-Filed Applications</h2>
  <div class="grid2">
    <div class="field"><div class="label">Prior Application Number</div><div class="value">${provisional_number || '___________________'}</div></div>
    <div class="field"><div class="label">Filing Date</div><div class="value">${filing_date ? new Date(filing_date + 'T00:00:00').toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}) : '___________________'}</div></div>
  </div>
  <p style="font-size:9pt;font-family:Arial,sans-serif;color:#666">If this IS the provisional, leave blank. Reference this app when filing the non-provisional.</p>

  <h2>6. Assignee Information (if any)</h2>
  <div class="grid2">
    <div class="field"><div class="label">Assignee Name / Organization</div><div class="value">${assigneeName || '___________________'}</div></div>
    <div class="field"><div class="label">Assignee Address</div><div class="value">${assigneeAddress || '___________________'}</div></div>
  </div>

  <h2>7. Signature</h2>
  <p style="font-size:9pt;font-family:Arial,sans-serif;color:#555">Under 37 CFR 1.4(d)(2), a typed signature in the format /Name/ satisfies electronic signature requirements.</p>
  <div class="grid2">
    <div class="field"><div class="label">Applicant Signature (typed)</div><div class="sig-value">${signature}</div></div>
    <div class="field"><div class="label">Date</div><div class="value">${today}</div></div>
  </div>
  <div class="field"><div class="label">Typed or Printed Name</div><div class="value">${inventorName}</div></div>
  <div class="field"><div class="label">Registration Number (Attorney/Agent)</div><div class="value disabled">N/A — Pro Se Filer</div></div>

  <div class="footer">
    <p>Form PTO/AIA/14 — Generated by PatentPending.app on ${todayLong}</p>
    <p>File at patentcenter.uspto.gov · PatentPending.app is not a law firm.</p>
  </div>
</body>
</html>`
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

  // ── Fetch patent ────────────────────────────────────────────────────────────
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, title, inventors, provisional_number, application_number, filing_date, spec_draft, claims_draft, abstract_draft, spec_uploaded, figures_uploaded, cover_sheet_acknowledged')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Fetch user profile for cover sheet ─────────────────────────────────────
  const { data: profile } = await supabaseService
    .from('patent_profiles')
    .select('name_first, name_middle, name_last, address_line_1, city, state, zip, country, phone, email, uspto_customer_number, default_assignee_name, default_assignee_address')
    .eq('id', user.id)
    .single()

  // ── Build ZIP ───────────────────────────────────────────────────────────────
  const zip = new JSZip()
  const dateStr = new Date().toISOString().split('T')[0]
  const folderName = `${slugify(patent.title ?? 'patent')}-${scenario.replace(/_/g, '-')}-${dateStr}`
  const folder = zip.folder(folderName)!

  const hasSpec = !!(patent.spec_draft)
  const hasClaims = !!(patent.claims_draft)
  const hasFigures = !!(patent.figures_uploaded)

  // ── README ──────────────────────────────────────────────────────────────────
  folder.file('README.txt', buildReadme(scenario, patent as Record<string, unknown>, hasSpec, hasClaims, hasFigures))

  // ── Scenario: provisional_filing ────────────────────────────────────────────
  if (scenario === 'provisional_filing' || scenario === 'non_provisional_prep') {
    // Cover sheet (HTML)
    folder.file('01-cover-sheet.html', buildCoverSheetHtml(patent as Record<string, unknown>, profile as Record<string, unknown> | null))

    // Specification
    if (patent.spec_draft) {
      folder.file('02-specification.txt', patent.spec_draft)
    } else {
      folder.file('02-specification-MISSING.txt', `SPECIFICATION NOT YET GENERATED

This patent does not yet have a specification draft.

To generate one:
1. Go to PatentPending.app
2. Open this patent
3. Go to the Filing tab
4. Complete Step 5: Specification
`)
    }

    // Claims
    if (patent.claims_draft) {
      folder.file('03-claims.txt', patent.claims_draft)
    } else {
      folder.file('03-claims-MISSING.txt', `CLAIMS NOT YET GENERATED

This patent does not yet have claims.

To generate:
1. Go to PatentPending.app
2. Open this patent
3. Go to the Claims tab
4. Generate and approve claims
`)
    }

    // Abstract (bonus — include if exists)
    if (patent.abstract_draft) {
      folder.file('04-abstract.txt', patent.abstract_draft)
    }

    // Figures — list and download from storage
    if (patent.figures_uploaded) {
      const figuresFolder = folder.folder('figures')!

      // Try AI-generated path first: {patentId}/figures/
      const { data: aiList } = await supabaseService.storage
        .from('patent-uploads')
        .list(`${patentId}/figures`, { limit: 20 })

      const aiFiles = (aiList ?? []).filter(f => f.name.match(/^fig\d+\.(svg|png|jpg|jpeg|pdf)$/i))

      // Also try user-uploaded path: {userId}/{patentId}/figures/
      const { data: userList } = await supabaseService.storage
        .from('patent-uploads')
        .list(`${user.id}/${patentId}/figures`, { limit: 20 })

      const userFiles = (userList ?? []).filter(f =>
        f.name.match(/\.(svg|png|jpg|jpeg|pdf)$/i)
      )

      // Download and add AI-generated figures
      for (const fig of aiFiles) {
        try {
          const path = `${patentId}/figures/${fig.name}`
          const { data: signed } = await supabaseService.storage
            .from('patent-uploads')
            .createSignedUrl(path, 300)
          if (signed?.signedUrl) {
            const res = await fetch(signed.signedUrl)
            if (res.ok) {
              const buf = await res.arrayBuffer()
              figuresFolder.file(fig.name, buf)
            }
          }
        } catch { /* skip failed downloads */ }
      }

      // Download and add user-uploaded figures
      for (const fig of userFiles) {
        try {
          const path = `${user.id}/${patentId}/figures/${fig.name}`
          const { data: signed } = await supabaseService.storage
            .from('patent-uploads')
            .createSignedUrl(path, 300)
          if (signed?.signedUrl) {
            const res = await fetch(signed.signedUrl)
            if (res.ok) {
              const buf = await res.arrayBuffer()
              figuresFolder.file(fig.name, buf)
            }
          }
        } catch { /* skip failed downloads */ }
      }
    }
  }

  // ── Scenario: assignment ────────────────────────────────────────────────────
  if (scenario === 'assignment') {
    folder.file('01-assignment-agreement-TEMPLATE.txt', buildAssignmentTemplate(patent as Record<string, unknown>))
    folder.file('02-inventor-declaration-TEMPLATE.txt', buildDeclarationTemplate(patent as Record<string, unknown>))
  }

  // ── Generate ZIP buffer ─────────────────────────────────────────────────────
  const zipBuffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const filename = `${folderName}.zip`

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zipBuffer.byteLength),
      'Cache-Control': 'no-store',
    },
  })
}
