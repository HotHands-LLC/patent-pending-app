import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Vercel runtime config ──────────────────────────────────────────────────────
// Increase function duration for multi-file AI processing
export const maxDuration = 60

const GEMINI_PRO_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
const GEMINI_FLASH_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Helper: extract non-thinking text from Gemini response parts
// Thinking models (2.5-pro/flash) emit a { thought: true } part before the real response
function geminiText(data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  return parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text ?? '')
    .join('')
}

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
])
const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024   // 10MB per file
const MAX_TOTAL_BYTES = 25 * 1024 * 1024  // 25MB total

// POST /api/intake/analyze-upload
// Accepts multipart/form-data with:
//   files[]           — up to 5 files
//   intake_session_id — existing draft session id
//
// Auth: Bearer token (Supabase JWT)
export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
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

  // ── Parse form data ────────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const intakeSessionId = formData.get('intake_session_id') as string | null
  if (!intakeSessionId) {
    return NextResponse.json({ error: 'intake_session_id is required' }, { status: 400 })
  }

  // Verify the session belongs to this user
  const { data: session } = await serviceClient
    .from('patent_intake_sessions')
    .select('id, owner_id')
    .eq('id', intakeSessionId)
    .eq('owner_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const rawFiles = formData.getAll('files') as File[]
  if (!rawFiles.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  // ── Validate files ─────────────────────────────────────────────────────────
  if (rawFiles.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed` }, { status: 400 })
  }

  let totalBytes = 0
  for (const file of rawFiles) {
    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json({
        error: `Unsupported file type: ${file.name} (${file.type}). Accepted: PDF, DOCX, TXT, MD, PNG, JPG, WEBP`
      }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({
        error: `File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB per file.`
      }, { status: 400 })
    }
    totalBytes += file.size
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({
      error: `Total upload size too large (${(totalBytes / 1024 / 1024).toFixed(1)}MB). Max 25MB total.`
    }, { status: 400 })
  }

  // ── Extract text from each file ───────────────────────────────────────────
  const textParts: string[] = []
  const imageParts: { base64: string; mimeType: string; filename: string }[] = []
  const uploadedFiles: { name: string; size: number; type: string; storage_path: string; uploaded_at: string }[] = []

  for (const file of rawFiles) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const isImage = file.type.startsWith('image/')

    if (isImage) {
      imageParts.push({
        base64: buffer.toString('base64'),
        mimeType: file.type,
        filename: file.name,
      })
    } else {
      const text = await extractText(file, buffer)
      if (text) {
        textParts.push(`=== ${file.name} ===\n${text}`)
      }
    }

    // Upload to Supabase Storage
    const storagePath = `${user.id}/${intakeSessionId}/uploads/${Date.now()}-${file.name}`
    const { error: uploadErr } = await serviceClient.storage
      .from('patent-uploads')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[analyze-upload] storage upload error:', uploadErr)
      // Don't fail the whole request — note but continue
    }

    uploadedFiles.push({
      name: file.name,
      size: file.size,
      type: file.type,
      storage_path: uploadErr ? '' : storagePath,
      uploaded_at: new Date().toISOString(),
    })
  }

  // ── Process images via Gemini Vision ─────────────────────────────────────
  for (const img of imageParts) {
    const visionText = await extractImageText(img.base64, img.mimeType, img.filename)
    if (visionText) {
      textParts.push(`=== ${img.filename} (image analysis) ===\n${visionText}`)
    }
  }

  const combinedContext = textParts.join('\n\n')
  if (!combinedContext.trim()) {
    return NextResponse.json({ error: 'Could not extract any content from the uploaded files.' }, { status: 422 })
  }

  // ── Call Gemini for structured extraction ─────────────────────────────────
  const extracted = await extractStructuredFields(combinedContext)

  // ── Update patent_intake_sessions with file metadata ─────────────────────
  await serviceClient
    .from('patent_intake_sessions')
    .update({
      uploaded_files: uploadedFiles,
      updated_at: new Date().toISOString(),
    })
    .eq('id', intakeSessionId)

  return NextResponse.json({ extracted, files: uploadedFiles })
}

// ── Text extractors ────────────────────────────────────────────────────────────

async function extractText(file: File, buffer: Buffer): Promise<string> {
  const type = file.type

  // PDF — uses pdf-parse v2 API: new PDFParse({ data: buffer }).getText()
  if (type === 'application/pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      const data = await parser.getText() as { text: string }
      return (data.text ?? '').slice(0, 50000)
    } catch (err) {
      console.error('[analyze-upload] pdf-parse error:', err)
      return ''
    }
  }

  // DOCX
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      type === 'application/msword') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer }) as { value: string }
      return result.value.slice(0, 50000)
    } catch (err) {
      console.error('[analyze-upload] mammoth error:', err)
      return ''
    }
  }

  // TXT / MD — read directly
  if (type === 'text/plain' || type === 'text/markdown' || type.startsWith('text/')) {
    return buffer.toString('utf-8').slice(0, 50000)
  }

  return ''
}

async function extractImageText(base64: string, mimeType: string, filename: string): Promise<string> {
  try {
    // Use gemini-2.5-flash for vision — faster and sufficient for text/diagram extraction
    const res = await fetch(`${GEMINI_FLASH_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            {
              text: `Extract all text, diagram descriptions, and invention-related content from this image (filename: ${filename}). Include all readable text, labels, annotations, and describe any technical diagrams or sketches in detail. Return the extracted content as plain text.`
            }
          ]
        }],
        // Higher token limit — thinking model uses some tokens for reasoning
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    })

    if (!res.ok) {
      console.error('[analyze-upload] Gemini Vision error:', res.status)
      return ''
    }

    const data = await res.json()
    return geminiText(data)
  } catch (err) {
    console.error('[analyze-upload] extractImageText error:', err)
    return ''
  }
}

async function extractStructuredFields(combinedContext: string): Promise<Record<string, unknown>> {
  const prompt = `You are a USPTO patent application assistant. A user has uploaded research documents about their invention. Extract and structure the following fields from the content below. Return ONLY valid JSON, no markdown, no explanation.

Fields to extract:
{
  "title": "Short invention title (5-10 words)",
  "description": "What the invention does and how (2-4 sentences)",
  "problem_solved": "What problem does this solve? (1-2 sentences)",
  "key_features": ["feature 1", "feature 2", "feature 3"],
  "target_market": "Who would use this? (1 sentence)",
  "prior_art_notes": "Any patents or existing products mentioned (or null)",
  "inventor_notes": "Any other relevant details for a patent attorney (or null)"
}

USER DOCUMENTS:
${combinedContext.slice(0, 30000)}`

  try {
    const res = await fetch(`${GEMINI_PRO_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status}`)
    }

    const data = await res.json()
    // Filter out thinking parts — gemini-2.5-pro emits thought:true parts before the response
    const raw = geminiText(data) || '{}'
    // Strip any leftover markdown code fences just in case
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.error('[analyze-upload] extractStructuredFields error:', err)
    return {
      title: null,
      description: null,
      problem_solved: null,
      key_features: [],
      target_market: null,
      prior_art_notes: null,
      inventor_notes: null,
    }
  }
}
