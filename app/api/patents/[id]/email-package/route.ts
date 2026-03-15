import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import sharp from 'sharp'
import JSZip from 'jszip'
import { USPTO_FEES } from '@/lib/uspto-fees'
import { buildCoverSheetPdf } from '@/lib/cover-sheet-pdf'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

type Scenario = 'provisional_filing' | 'assignment' | 'non_provisional_prep'

const SCENARIO_LABELS: Record<Scenario, string> = {
  provisional_filing: 'Provisional Filing',
  assignment: 'Assignment',
  non_provisional_prep: 'Non-Provisional Prep',
}

const MAX_ATTACH_BYTES = 20 * 1024 * 1024  // 20MB Resend limit

const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder-resend-key')

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function buildEmailBody(
  patent: Record<string, unknown>,
  scenario: Scenario,
  attachedFiles: string[],
  fallbackZipUrl?: string
): string {
  const title = (patent.title as string) ?? 'Your Patent'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const deadline = (patent.non_provisional_deadline as string) ?? (patent.provisional_deadline as string) ?? null
  const deadlineLine = deadline
    ? `\nIMPORTANT DEADLINE: ${new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`
    : ''

  const scenarioInstructions: Record<Scenario, string> = {
    provisional_filing: `FILING INSTRUCTIONS
-------------------
1. Review 01-cover-sheet.pdf — fill in any blank fields
2. Go to patentcenter.uspto.gov and sign in
3. Start a new Provisional Application
4. Upload each attached file
5. Pay filing fee: $${USPTO_FEES.provisional.micro} (micro) / $${USPTO_FEES.provisional.small} (small) / $${USPTO_FEES.provisional.large} (large entity)
6. Save your confirmation — it proves your priority date`,

    assignment: `ASSIGNMENT INSTRUCTIONS
-----------------------
1. Fill in all [BRACKETED] fields in the assignment agreement
2. Have all parties sign (inventor + assignee)
3. Record at USPTO: assignments.uspto.gov (~$40 fee)
4. Inventor declaration must be personally signed`,

    non_provisional_prep: `NON-PROVISIONAL INSTRUCTIONS
-----------------------------
1. Review 01-cover-sheet.pdf — confirm provisional number is listed
2. Go to patentcenter.uspto.gov and sign in
3. Start a new Non-Provisional Application
4. Upload all attached files
5. Fees: $${USPTO_FEES.nonProvisional.total.micro} (micro) / $${USPTO_FEES.nonProvisional.total.small} (small) / $${USPTO_FEES.nonProvisional.total.large.toLocaleString()} (large entity)
6. Consult a patent attorney before filing`,
  }

  const attachList = fallbackZipUrl
    ? `DOWNLOAD LINK (files too large for attachment — click to download ZIP):\n${fallbackZipUrl}\nLink expires in 1 hour.`
    : `ATTACHED FILES:\n${attachedFiles.map(f => `  • ${f}`).join('\n')}`

  return `Your ${SCENARIO_LABELS[scenario]} filing package for "${title}" is ready.

Generated: ${today}
${deadlineLine}
${attachList}

${scenarioInstructions[scenario]}

---
This package was prepared by Pattie — your PatentPending assistant.
PatentPending.app is not a law firm. This is not legal advice.
Visit patentpending.app for support.`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userEmail = user.email
  if (!userEmail) return NextResponse.json({ error: 'No email on account' }, { status: 400 })

  // ── Parse body ──────────────────────────────────────────────────────────────
  let scenario: Scenario = 'provisional_filing'
  try {
    const body = await req.json()
    if (['provisional_filing', 'assignment', 'non_provisional_prep'].includes(body.scenario)) {
      scenario = body.scenario
    }
  } catch { /* default */ }

  // ── Fetch patent ────────────────────────────────────────────────────────────
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, title, inventors, provisional_number, application_number, filing_date, provisional_deadline, non_provisional_deadline, spec_draft, claims_draft, abstract_draft, spec_uploaded, figures_uploaded, entity_status, provisional_app_number, provisional_filed_at')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Fetch user profile ──────────────────────────────────────────────────────
  const { data: profile } = await supabaseService
    .from('patent_profiles')
    .select('name_first, name_middle, name_last, address_line_1, city, state, zip, country, phone, email, uspto_customer_number, default_assignee_name, default_assignee_address')
    .eq('id', user.id)
    .single()

  // ── Build attachment list ───────────────────────────────────────────────────
  type Attachment = { filename: string; content: Buffer }
  const attachments: Attachment[] = []
  const attachedNames: string[] = []
  let totalBytes = 0

  const addFile = (filename: string, content: Buffer): boolean => {
    if (totalBytes + content.byteLength > MAX_ATTACH_BYTES) return false
    attachments.push({ filename, content })
    attachedNames.push(filename)
    totalBytes += content.byteLength
    return true
  }

  if (scenario === 'provisional_filing' || scenario === 'non_provisional_prep') {
    // Cover sheet PDF — always included (throws on failure so caller gets a proper error)
    const coverPdf = Buffer.from(
      await buildCoverSheetPdf(patent as Record<string, unknown>, profile as Record<string, unknown> | null)
    )
    addFile('01-cover-sheet.pdf', coverPdf)

    // Specification
    if (patent.spec_draft) {
      addFile('02-specification.txt', Buffer.from(patent.spec_draft))
    }

    // Claims
    if (patent.claims_draft) {
      addFile('03-claims.txt', Buffer.from(patent.claims_draft))
    }

    // Abstract
    if (patent.abstract_draft) {
      addFile('04-abstract.txt', Buffer.from(patent.abstract_draft))
    }

    // Figures — download + sharp to 300 DPI PNG
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

          const outName = fig.name.replace(/\.(svg|jpg|jpeg)$/i, '.png')
          if (!addFile(outName, pngBuf)) {
            console.log(`[email-package] size cap hit, skipping ${outName}`)
            break
          }
        } catch { /* skip */ }
      }
    }
  }

  if (scenario === 'assignment') {
    // These are just text — always fit
    const assignText = `PATENT ASSIGNMENT AGREEMENT — TEMPLATE\n\nThis is a template. Fill in all [BRACKETED] fields before signing.\n\nTitle: ${patent.title ?? ''}\nInventors: ${((patent.inventors as string[]) ?? []).join(', ')}\n\nRecord completed assignment at: assignments.uspto.gov`
    const declText = `INVENTOR DECLARATION — TEMPLATE (37 CFR 1.63)\n\nThis is a template. The inventor must personally sign.\n\nTitle: ${patent.title ?? ''}\nInventors: ${((patent.inventors as string[]) ?? []).join(', ')}`
    addFile('01-assignment-agreement-TEMPLATE.txt', Buffer.from(assignText))
    addFile('02-inventor-declaration-TEMPLATE.txt', Buffer.from(declText))
  }

  // ── Size check — fall back to ZIP link if too large ──────────────────────────
  let fallbackZipUrl: string | undefined
  const isOverLimit = totalBytes > MAX_ATTACH_BYTES

  if (isOverLimit || attachments.length === 0) {
    // Build ZIP and upload to Supabase Storage for 1-hour signed URL
    try {
      const zip = new JSZip()
      for (const att of attachments) zip.file(att.filename, att.content)
      const zipBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
      const dateStr = new Date().toISOString().split('T')[0]
      const zipPath = `${patentId}/packages/${slugify(patent.title ?? 'patent')}-${scenario}-${dateStr}.zip`

      await supabaseService.storage
        .from('patent-uploads')
        .upload(zipPath, zipBuf, { contentType: 'application/zip', upsert: true })

      const { data: signed } = await supabaseService.storage
        .from('patent-uploads')
        .createSignedUrl(zipPath, 3600)

      fallbackZipUrl = signed?.signedUrl ?? ''
    } catch (e) {
      console.error('[email-package] ZIP fallback error:', e)
    }
  }

  // ── Send via Resend ─────────────────────────────────────────────────────────
  const scenarioLabel = SCENARIO_LABELS[scenario]
  const subject = `Your ${patent.title} — ${scenarioLabel} filing package`

  try {
    await resend.emails.send({
      from: 'PatentPending.app <notifications@patentpending.app>',
      to: userEmail,
      subject,
      text: buildEmailBody(
        patent as Record<string, unknown>,
        scenario,
        attachedNames,
        fallbackZipUrl
      ),
      attachments: fallbackZipUrl ? [] : attachments.map(a => ({
        filename: a.filename,
        content: a.content.toString('base64'),
      })),
    })
  } catch (err) {
    console.error('[email-package] Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    email: userEmail,
    filesAttached: fallbackZipUrl ? 0 : attachments.length,
    fallbackLink: fallbackZipUrl ?? null,
    totalBytes,
    message: fallbackZipUrl
      ? `Package too large for attachments — sent download link to ${userEmail}`
      : `Sent ${attachments.length} files to ${userEmail}`,
  })
}
