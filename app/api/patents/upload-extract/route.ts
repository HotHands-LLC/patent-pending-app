/**
 * POST /api/patents/upload-extract
 *
 * Prompt 53A — Upload & Extract Pipeline
 *
 * Accepts a file upload (PDF, DOCX, TXT, MD, PNG, JPEG, HEIC/HEIF, audio)
 * or a Google Doc URL, extracts structured invention information via Gemini
 * 2.5 Pro, and pre-populates a patent record (creating one if needed).
 *
 * Rules:
 *  - No module-level Supabase or Gemini clients
 *  - No secrets hardcoded
 *  - File size limit: 25MB
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PatentLifecycleState } from '@/lib/patent-lifecycle'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // Gemini extraction can take time

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/heic',
  'image/heif',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
])

const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractionResult {
  title: string
  description: string
  claims_draft: string
  abstract: string
  figures: string[]
  extraction_notes: string
  source_type: string
  confidence: 'high' | 'medium' | 'low'
}

type PatentRow = {
  id: string
  status: string | null
  filing_date: string | null
  claims_draft: string | null
  abstract_draft: string | null
  title: string | null
  filing_status?: string | null
}

// ── Lifecycle state inference (local copy from backfill-lifecycle-states) ─────

function inferLifecycleState(p: PatentRow): PatentLifecycleState {
  if (p.status === 'granted') return 'GRANTED'
  if (p.status === 'non_provisional') return 'FILED_NONPROVISIONAL'
  if (p.status === 'provisional' && p.filing_date) return 'PROVISIONAL_ACTIVE'
  if (p.status === 'provisional' && !p.filing_date) return 'FILED_PROVISIONAL'
  if (p.status === 'abandoned') return 'ABANDONED'
  if (
    p.claims_draft && p.claims_draft.trim() !== '' &&
    p.abstract_draft && p.abstract_draft.trim() !== '' &&
    p.title && p.title.trim() !== ''
  ) return 'READY_TO_FILE'
  return 'DRAFT'
}

// ── Gemini extraction prompt ──────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a USPTO patent specialist. Analyze the provided content (document, image, audio, or notes) from an inventor and extract structured information about their invention.

Return ONLY valid JSON with this exact structure:
{
  "title": "A clear, concise invention title (USPTO style, prefer noun phrases over 'A system for...')",
  "description": "A detailed description of the invention — what it is, how it works, key components, novel aspects. Write in plain inventor's language, not formal patent prose. Include everything relevant from the source.",
  "claims_draft": "Any claims found in the source, or 1-3 candidate independent claims inferred from the description. Number each claim: 1., 2., etc.",
  "abstract": "A 100-150 word abstract summarizing the invention",
  "figures": ["Brief description of any figures, diagrams, or images mentioned or visible"],
  "extraction_notes": "Important observations: gaps in the disclosure, things the inventor should clarify, unclear terminology, potential prior art flags, or quality notes about the source material",
  "source_type": "document | image | audio | url",
  "confidence": "high | medium | low"
}

If the source contains very little information, still return the structure — populate what you can and flag gaps in extraction_notes. Never return null for any field — use empty string if nothing is available.`

// ── Google Doc URL helper ─────────────────────────────────────────────────────

function extractGoogleDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth — Bearer token → supabase.auth.getUser() ─────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Supabase service client (inside handler — never module-level) ──────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'
  )

  // ── Parse multipart/form-data ──────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const fileField = formData.get('file')
  const googleDocUrl = formData.get('google_doc_url')?.toString() ?? null
  const patentIdField = formData.get('patent_id')?.toString() ?? null

  // Validate: at least one source required
  if (!fileField && !googleDocUrl) {
    return NextResponse.json(
      { error: 'Either file or google_doc_url is required' },
      { status: 400 }
    )
  }

  // ── Track whether we created a new patent ─────────────────────────────
  const patentIdWasProvided = !!patentIdField
  let patent_id: string | null = patentIdField

  // ── Variables populated by source branch ──────────────────────────────
  let sourceType: string
  let fileName: string
  let geminiPayload: Record<string, unknown>

  // ── Branch: file vs Google Doc URL ────────────────────────────────────
  if (fileField && fileField instanceof File) {
    const file = fileField
    fileName = file.name || 'unknown'
    const mimeType = file.type || 'application/octet-stream'

    // Validate MIME type
    if (!ACCEPTED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}` },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 25MB (received ${(file.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 400 }
      )
    }

    // ── PDF ────────────────────────────────────────────────────────────
    if (mimeType === 'application/pdf') {
      sourceType = 'document'
      const { PDFParse } = await import('pdf-parse')
      const buffer = Buffer.from(await file.arrayBuffer())
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const parsed = await parser.getText()
      const text = parsed.text

      geminiPayload = {
        contents: [{
          parts: [{
            text: `${EXTRACTION_PROMPT}\n\nINVENTOR CONTENT:\n${text}`,
          }],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }

    // ── DOCX ───────────────────────────────────────────────────────────
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      sourceType = 'document'
      const mammoth = await import('mammoth')
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await mammoth.extractRawText({ buffer })
      const text = result.value

      geminiPayload = {
        contents: [{
          parts: [{
            text: `${EXTRACTION_PROMPT}\n\nINVENTOR CONTENT:\n${text}`,
          }],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }

    // ── TXT / MD ───────────────────────────────────────────────────────
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      sourceType = 'document'
      const text = await file.text()

      geminiPayload = {
        contents: [{
          parts: [{
            text: `${EXTRACTION_PROMPT}\n\nINVENTOR CONTENT:\n${text}`,
          }],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }

    // ── HEIC / HEIF — convert to JPEG first via sharp ──────────────────
    } else if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      sourceType = 'image'
      const sharp = (await import('sharp')).default
      const buffer = Buffer.from(await file.arrayBuffer())
      const jpegBuffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer()
      const base64 = jpegBuffer.toString('base64')

      geminiPayload = {
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }

    // ── PNG / JPEG ─────────────────────────────────────────────────────
    } else if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      sourceType = 'image'
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')

      geminiPayload = {
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }

    // ── Audio (M4A, MP3, WAV) — Gemini 2.5 Pro handles natively ────────
    } else if (
      mimeType === 'audio/mp4' ||
      mimeType === 'audio/mpeg' ||
      mimeType === 'audio/wav' ||
      mimeType === 'audio/x-m4a'
    ) {
      sourceType = 'audio'
      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString('base64')

      geminiPayload = {
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }

    } else {
      // Should not reach here given ACCEPTED_TYPES check above
      return NextResponse.json({ error: `Unsupported MIME type: ${mimeType}` }, { status: 400 })
    }

  } else if (googleDocUrl) {
    // ── Google Doc URL ─────────────────────────────────────────────────
    sourceType = 'url'
    fileName = googleDocUrl

    const docId = extractGoogleDocId(googleDocUrl)
    if (!docId) {
      return NextResponse.json({ error: 'Invalid Google Doc URL' }, { status: 400 })
    }

    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`
    const docRes = await fetch(exportUrl)
    if (!docRes.ok) {
      return NextResponse.json(
        { error: 'Could not fetch Google Doc — make sure it is publicly accessible or shared with the service account' },
        { status: 400 }
      )
    }
    const text = await docRes.text()

    geminiPayload = {
      contents: [{
        parts: [{
          text: `${EXTRACTION_PROMPT}\n\nINVENTOR CONTENT:\n${text}`,
        }],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }

  } else {
    return NextResponse.json(
      { error: 'Either file or google_doc_url is required' },
      { status: 400 }
    )
  }

  // ── Call Gemini — instantiated inside handler, never at module level ──
  const geminiRes = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiPayload),
  })

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('[upload-extract] Gemini API error:', geminiRes.status, errText.slice(0, 200))
    return NextResponse.json(
      { error: `Gemini API error: ${geminiRes.status}` },
      { status: 502 }
    )
  }

  const geminiData = await geminiRes.json()
  const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // ── Parse Gemini response ──────────────────────────────────────────────
  let extraction: ExtractionResult
  try {
    const cleaned = rawText.replace(/^```json\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    extraction = JSON.parse(cleaned) as ExtractionResult
  } catch {
    // Gemini returned non-JSON — create a partial result
    extraction = {
      title: '',
      description: rawText.slice(0, 2000),
      claims_draft: '',
      abstract: '',
      figures: [],
      extraction_notes: 'Gemini returned unstructured text — review manually',
      source_type: sourceType,
      confidence: 'low',
    }
  }

  // Ensure figures is always an array
  if (!Array.isArray(extraction.figures)) {
    extraction.figures = []
  }

  // ── Patent record update / create ─────────────────────────────────────
  const fieldsSkipped: string[] = []
  const fieldsPopulated: string[] = []

  if (patent_id) {
    // Fetch existing patent
    const { data: patent, error: patentErr } = await supabase
      .from('patents')
      .select('id, title, description, claims_draft, abstract_draft, owner_id')
      .eq('id', patent_id)
      .single()

    if (patentErr || !patent) {
      return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
    }

    // Build update — only fill empty fields
    const update: Record<string, string> = {}

    const fieldMap = [
      { extracted: extraction.title, dbCol: 'title', existing: patent.title as string | null },
      { extracted: extraction.description, dbCol: 'description', existing: patent.description as string | null },
      { extracted: extraction.claims_draft, dbCol: 'claims_draft', existing: patent.claims_draft as string | null },
      { extracted: extraction.abstract, dbCol: 'abstract_draft', existing: patent.abstract_draft as string | null },
    ]

    for (const f of fieldMap) {
      if (f.extracted && f.extracted.trim()) {
        if (!f.existing || !f.existing.trim()) {
          update[f.dbCol] = f.extracted
          fieldsPopulated.push(f.dbCol)
        } else {
          fieldsSkipped.push(f.dbCol)
        }
      }
    }

    if (Object.keys(update).length > 0) {
      await supabase.from('patents').update(update).eq('id', patent_id)
    }

  } else {
    // Create new patent record
    const { data: newPatent, error: insertErr } = await supabase
      .from('patents')
      .insert({
        title: extraction.title || 'Untitled Patent',
        description: extraction.description || null,
        claims_draft: extraction.claims_draft || null,
        abstract_draft: extraction.abstract || null,
        owner_id: user.id,
        status: 'draft',
        lifecycle_state: 'DRAFT',
      })
      .select('id')
      .single()

    if (insertErr || !newPatent) {
      console.error('[upload-extract] Patent insert error:', insertErr?.message)
      return NextResponse.json({ error: 'Failed to create patent record' }, { status: 500 })
    }

    patent_id = newPatent.id

    // Track which fields were populated
    if (extraction.title || 'Untitled Patent') fieldsPopulated.push('title')
    if (extraction.description) fieldsPopulated.push('description')
    if (extraction.claims_draft) fieldsPopulated.push('claims_draft')
    if (extraction.abstract) fieldsPopulated.push('abstract_draft')
  }

  // ── Lifecycle state refresh after update ──────────────────────────────
  const { data: refreshed } = await supabase
    .from('patents')
    .select('id, status, filing_date, claims_draft, abstract_draft, title')
    .eq('id', patent_id)
    .single()

  if (refreshed) {
    const newState = inferLifecycleState(refreshed as PatentRow)
    await supabase.from('patents').update({ lifecycle_state: newState }).eq('id', patent_id)
  }

  // ── Correspondence save ───────────────────────────────────────────────
  const figuresCount = Array.isArray(extraction.figures) ? extraction.figures.length : 0
  const claimsCount = (extraction.claims_draft.match(/^\d+\./gm) ?? []).length
  const descWordCount = extraction.description?.split(/\s+/).length ?? 0

  const correspondenceBody = `**Source:** ${fileName}
**Type:** ${extraction.source_type}
**Confidence:** ${extraction.confidence}

**What Pattie extracted:**
- Title: ${extraction.title || '(none)'}
- Description: ${descWordCount} words
- Claims: ${claimsCount} found/inferred
- Abstract: ${extraction.abstract ? 'Yes' : 'No'}
- Figures noted: ${figuresCount}

**Extraction notes:**
${extraction.extraction_notes || 'None'}

**Fields skipped (already had content):**
${fieldsSkipped.length > 0 ? fieldsSkipped.join(', ') : 'None — all fields populated'}

---
*Extracted by Pattie on ${new Date().toISOString().slice(0, 10)}. Source file not stored — extraction only.*`

  const { data: corr, error: corrErr } = await supabase
    .from('patent_correspondence')
    .insert({
      patent_id,
      owner_id: user.id,
      title: `Pattie: Upload Extraction — ${fileName}`,
      content: correspondenceBody,
      type: 'ai_action',
      tags: ['pattie_action', 'upload_extraction'],
      from_party: 'Pattie',
      to_party: 'Patent Record',
      correspondence_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()

  if (corrErr) {
    console.error('[upload-extract] Correspondence insert error:', corrErr.message)
    // Non-fatal — continue and return success
  }

  // ── Return ────────────────────────────────────────────────────────────
  return NextResponse.json({
    patent_id,
    created: !patentIdWasProvided,
    fields_populated: fieldsPopulated,
    fields_skipped: fieldsSkipped,
    extraction_notes: extraction.extraction_notes,
    confidence: extraction.confidence,
    correspondence_id: corr?.id ?? null,
  })
}
