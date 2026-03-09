import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

export const maxDuration = 60

// USPTO drawing spec: max 21.6cm × 27.9cm at 300 DPI = 2551 × 3295px
const USPTO_WIDTH_PX  = 2551
const USPTO_HEIGHT_PX = 3295
const MAX_FILES = 10
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024   // 10MB
const MAX_TOTAL_BYTES    = 50 * 1024 * 1024   // 50MB

// Accepted MIME types — broad acceptance, Sharp handles the conversion
const ACCEPTED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/bmp',
  'application/pdf',   // PDF figures stored as-is (Sharp can't reliably rasterize PDF)
])
const ACCEPTED_EXT = ['.png','.jpg','.jpeg','.webp','.tiff','.tif','.heic','.heif','.bmp','.pdf']

// Low-contrast threshold: greyscale stdev < 40 → likely a photo, not line art
const LOW_CONTRAST_STDEV = 40

// POST /api/patents/[id]/upload-figures
// Accepts up to 10 image/PDF figures.
// Images are auto-converted to greyscale PNG at 300 DPI (USPTO compliant) via Sharp.
// Returns lowContrastWarning per file so UI can surface the appropriate message.
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
    const lc = f.name.toLowerCase()
    const validType = ACCEPTED_MIME.has(f.type) || ACCEPTED_EXT.some(e => lc.endsWith(e))
    if (!validType) {
      return NextResponse.json({ error: `Unsupported file type: ${f.name}. Use PNG, JPG, WebP, HEIC, TIFF, or PDF.` }, { status: 400 })
    }
    if (f.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json({ error: `${f.name} exceeds 10MB limit.` }, { status: 400 })
    }
    totalBytes += f.size
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: 'Total size exceeds 50MB limit.' }, { status: 400 })
  }

  // ── Process + upload each file ────────────────────────────────────────────
  type UploadedFile = {
    name: string
    outputName: string
    size: number
    storage_path: string
    signed_url: string
    converted: boolean
    lowContrastWarning: boolean
  }

  const uploaded: UploadedFile[] = []
  const attachments: { name: string; size: number; storage_path: string }[] = []

  for (const file of rawFiles) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const rawBuf = Buffer.from(await file.arrayBuffer())

    let processedBuf: Buffer
    let outputName: string
    let converted = false
    let lowContrastWarning = false
    let contentType: string

    if (isPdf) {
      // PDFs stored as-is — Sharp can't reliably rasterize multi-page PDFs
      processedBuf = rawBuf
      outputName = file.name
      contentType = 'application/pdf'
    } else {
      // ── Sharp pipeline: greyscale 300 DPI, fit within USPTO letter dimensions ──
      try {
        const pipeline = sharp(rawBuf, { density: 300 })
          .resize({
            width: USPTO_WIDTH_PX,
            height: USPTO_HEIGHT_PX,
            fit: 'inside',
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .greyscale()
          .png({ compressionLevel: 9 })

        processedBuf = await pipeline.toBuffer()
        converted = true
        outputName = file.name.replace(/\.(jpe?g|webp|tiff?|heic|heif|bmp)$/i, '.png')
        if (!outputName.toLowerCase().endsWith('.png')) outputName += '.png'
        contentType = 'image/png'

        // ── Low-contrast check ─────────────────────────────────────────────
        try {
          const stats = await sharp(processedBuf).stats()
          // sharp ChannelStats uses 'stdev' not 'std'
          const stdev = (stats.channels[0] as unknown as { stdev?: number })?.stdev ?? 255
          if (stdev < LOW_CONTRAST_STDEV) {
            lowContrastWarning = true
          }
        } catch { /* non-fatal — skip warning check */ }

      } catch (err) {
        console.error(`[upload-figures] Sharp error on ${file.name}:`, err)
        // Fallback: store original unprocessed
        processedBuf = rawBuf
        outputName = file.name
        contentType = file.type || 'image/png'
      }
    }

    const timestamp = Date.now()
    const storagePath = `${user.id}/${patentId}/figures/${timestamp}-${outputName}`

    const { error: uploadErr } = await serviceClient.storage
      .from('patent-uploads')
      .upload(storagePath, processedBuf, { contentType, upsert: false })

    if (uploadErr) {
      console.error(`[upload-figures] storage error for ${file.name}:`, uploadErr)
      continue
    }

    const { data: signed } = await serviceClient.storage
      .from('patent-uploads')
      .createSignedUrl(storagePath, 3600)

    uploaded.push({
      name: file.name,
      outputName,
      size: processedBuf.byteLength,
      storage_path: storagePath,
      signed_url: signed?.signedUrl ?? '',
      converted,
      lowContrastWarning,
    })
    attachments.push({ name: outputName, size: processedBuf.byteLength, storage_path: storagePath })
  }

  if (!uploaded.length) {
    return NextResponse.json({ error: 'All uploads failed. Check file types and sizes.' }, { status: 500 })
  }

  // ── Update patent ──────────────────────────────────────────────────────────
  await serviceClient
    .from('patents')
    .update({ figures_uploaded: true, updated_at: new Date().toISOString() })
    .eq('id', patentId)

  // ── Insert correspondence record ───────────────────────────────────────────
  const convertedCount = uploaded.filter(f => f.converted).length
  await serviceClient.from('patent_correspondence').insert({
    patent_id: patentId,
    owner_id: user.id,
    title: `Drawing Figures — ${uploaded.length} file${uploaded.length > 1 ? 's' : ''} (${uploaded.map(f => f.outputName).join(', ')})`,
    type: 'filing',
    content: `USPTO-compliant drawings uploaded via PatentPending.app.\n${convertedCount > 0 ? `Auto-converted to greyscale PNG at 300 DPI: ${convertedCount} file(s)\n` : ''}Files: ${uploaded.map(f => `${f.outputName} (${(f.size/1024/1024).toFixed(2)}MB)`).join(', ')}`,
    from_party: 'Inventor',
    to_party: 'USPTO (Pending)',
    correspondence_date: new Date().toISOString().split('T')[0],
    attachments,
    tags: ['figures', 'drawings', 'filing-doc'],
  })

  console.log(`[upload-figures] ✅ ${uploaded.length} figures processed + uploaded for patent ${patentId} (${convertedCount} converted)`)

  return NextResponse.json({
    files: uploaded,
    count: uploaded.length,
    convertedCount,
  })
}
