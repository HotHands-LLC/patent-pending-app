import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
])
const MAX_BYTES = 25 * 1024 * 1024 // 25MB

// POST /api/patents/[id]/upload-spec
// Accepts a single specification document (PDF, DOCX, MD, TXT).
// Uploads to Supabase Storage, updates patents.spec_uploaded, inserts correspondence record.
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
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
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
  if (!rawFiles.length) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const file = rawFiles[0] // spec = single file

  if (!ACCEPTED_TYPES.has(file.type) &&
      !['pdf','docx','doc','md','txt'].some(ext => file.name.toLowerCase().endsWith('.' + ext))) {
    return NextResponse.json({ error: `Unsupported file type: ${file.name}` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${(file.size/1024/1024).toFixed(1)}MB). Max 25MB.` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // ── Upload to Supabase Storage ─────────────────────────────────────────────
  const storagePath = `${user.id}/${patentId}/spec/${Date.now()}-${file.name}`

  const { error: uploadErr } = await serviceClient.storage
    .from('patent-uploads')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('[upload-spec] storage error:', uploadErr)
    return NextResponse.json({ error: 'Storage upload failed', details: uploadErr.message }, { status: 500 })
  }

  // ── Generate signed URL (1-hour) ───────────────────────────────────────────
  const { data: signed } = await serviceClient.storage
    .from('patent-uploads')
    .createSignedUrl(storagePath, 3600)

  // ── Update patent: spec_uploaded = true ───────────────────────────────────
  await serviceClient
    .from('patents')
    .update({ spec_uploaded: true, updated_at: new Date().toISOString() })
    .eq('id', patentId)

  // ── Insert correspondence record ───────────────────────────────────────────
  await serviceClient.from('patent_correspondence').insert({
    patent_id: patentId,
    owner_id: user.id,
    title: `Specification Document — ${file.name}`,
    type: 'filing',
    content: `Specification document uploaded via PatentPending.app.\nFile: ${file.name} (${(file.size/1024/1024).toFixed(2)}MB)\nStorage: ${storagePath}`,
    from_party: 'Inventor',
    to_party: 'USPTO (Pending)',
    correspondence_date: new Date().toISOString().split('T')[0],
    attachments: [{ name: file.name, size: file.size, storage_path: storagePath }],
    tags: ['spec', 'filing-doc'],
  })

  console.log(`[upload-spec] ✅ spec uploaded for patent ${patentId} by ${user.id}: ${storagePath}`)

  return NextResponse.json({
    files: [{ name: file.name, size: file.size, signed_url: signed?.signedUrl || '' }],
    storage_path: storagePath,
  })
}
