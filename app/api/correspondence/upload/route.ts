import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',         // .md standard MIME
  'text/x-markdown',      // .md alternate MIME (some OS/browsers)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
])
const ACCEPTED_EXT = ['.pdf', '.txt', '.md', '.docx', '.doc', '.png', '.jpg', '.jpeg']
const MAX_BYTES = 10 * 1024 * 1024  // 10MB

// POST /api/correspondence/upload
// Uploads a single file attachment for a correspondence entry.
// Body: FormData with 'file' field + optional 'patent_id' field.
// Returns: { name, size, storage_path, signed_url }
export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Parse form data ──────────────────────────────────────────────────────────
  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const patentId = (formData.get('patent_id') as string | null) ?? 'general'
  const lc = file.name.toLowerCase()

  if (!ACCEPTED_MIME.has(file.type) && !ACCEPTED_EXT.some(e => lc.endsWith(e))) {
    return NextResponse.json({ error: `Unsupported file type: ${file.name}. Use PDF, TXT, DOCX, PNG, or JPG.` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `${file.name} exceeds 10MB limit.` }, { status: 400 })
  }

  // ── Upload to Supabase Storage ───────────────────────────────────────────────
  const timestamp = Date.now()
  const storagePath = `${user.id}/${patentId}/correspondence/${timestamp}-${file.name}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await serviceClient.storage
    .from('patent-uploads')
    .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })

  if (uploadErr) {
    console.error('[correspondence/upload] storage error:', uploadErr)
    return NextResponse.json({ error: 'Upload failed — please try again' }, { status: 500 })
  }

  // 24-hour signed URL (long enough for the session; user can re-download via download endpoint)
  const { data: signed } = await serviceClient.storage
    .from('patent-uploads')
    .createSignedUrl(storagePath, 86400)

  return NextResponse.json({
    name: file.name,
    size: file.size,
    storage_path: storagePath,
    signed_url: signed?.signedUrl ?? '',
  })
}
