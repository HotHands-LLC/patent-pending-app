import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validatePDFBuffer } from '@/lib/pdf-validate'

export const maxDuration = 60

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
])
const MAX_FILES = 10
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024  // 10MB each
const MAX_TOTAL_BYTES = 50 * 1024 * 1024     // 50MB total

// POST /api/patents/[id]/upload-figures
// Accepts 1–10 drawing/figure files (PDF, PNG, JPG).
// Uploads all to Supabase Storage, updates patents.figures_uploaded, inserts correspondence.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Verify patent ownership ────────────────────────────────────────────────
  const { data: patent } = await serviceClient
    .from('patents')
    .select('id, owner_id, title')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse form data ────────────────────────────────────────────────────────
  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const rawFiles = formData.getAll('files') as File[]
  if (!rawFiles.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  if (rawFiles.length > MAX_FILES) return NextResponse.json({ error: `Max ${MAX_FILES} figures allowed` }, { status: 400 })

  let totalBytes = 0
  for (const f of rawFiles) {
    if (!ACCEPTED_TYPES.has(f.type) && !['pdf','png','jpg','jpeg'].some(ext => f.name.toLowerCase().endsWith('.' + ext))) {
      return NextResponse.json({ error: `Unsupported file type: ${f.name}. Use PDF, PNG, or JPG.` }, { status: 400 })
    }
    if (f.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json({ error: `${f.name} exceeds 10MB limit.` }, { status: 400 })
    }
    totalBytes += f.size
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: 'Total size exceeds 50MB limit.' }, { status: 400 })
  }

  // ── Upload all files to Supabase Storage ───────────────────────────────────
  const uploaded: { name: string; size: number; storage_path: string; signed_url: string }[] = []
  const attachments: { name: string; size: number; storage_path: string }[] = []

  for (const file of rawFiles) {
    const buffer = Buffer.from(await file.arrayBuffer())

    // ── PDF compliance validation for any PDF figure (USPTO: 1.4–1.7 only) ──
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (isPDF) {
      const pdfCheck = validatePDFBuffer(buffer, file.name)
      if (!pdfCheck.valid) {
        return NextResponse.json({ error: pdfCheck.error }, { status: 400 })
      }
    }

    const storagePath = `${user.id}/${patentId}/figures/${Date.now()}-${file.name}`

    const { error: uploadErr } = await serviceClient.storage
      .from('patent-uploads')
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
      console.error(`[upload-figures] storage error for ${file.name}:`, uploadErr)
      continue // Skip failed files, don't abort the whole batch
    }

    const { data: signed } = await serviceClient.storage
      .from('patent-uploads')
      .createSignedUrl(storagePath, 3600)

    uploaded.push({ name: file.name, size: file.size, storage_path: storagePath, signed_url: signed?.signedUrl || '' })
    attachments.push({ name: file.name, size: file.size, storage_path: storagePath })
  }

  if (!uploaded.length) {
    return NextResponse.json({ error: 'All uploads failed. Check file types and sizes.' }, { status: 500 })
  }

  // ── Update patent: figures_uploaded = true ─────────────────────────────────
  await serviceClient
    .from('patents')
    .update({ figures_uploaded: true, updated_at: new Date().toISOString() })
    .eq('id', patentId)

  // ── Insert correspondence record ───────────────────────────────────────────
  await serviceClient.from('patent_correspondence').insert({
    patent_id: patentId,
    owner_id: user.id,
    title: `Drawing Figures — ${uploaded.length} file${uploaded.length > 1 ? 's' : ''} (${uploaded.map(f => f.name).join(', ')})`,
    type: 'filing',
    content: `USPTO-compliant drawings uploaded via PatentPending.app.\nFiles: ${uploaded.map(f => `${f.name} (${(f.size/1024/1024).toFixed(2)}MB)`).join(', ')}`,
    from_party: 'Inventor',
    to_party: 'USPTO (Pending)',
    correspondence_date: new Date().toISOString().split('T')[0],
    attachments,
    tags: ['figures', 'drawings', 'filing-doc'],
  })

  console.log(`[upload-figures] ✅ ${uploaded.length} figures uploaded for patent ${patentId}`)

  return NextResponse.json({ files: uploaded, count: uploaded.length })
}
