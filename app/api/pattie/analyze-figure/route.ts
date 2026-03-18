import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTierInfo, isPro } from '@/lib/tier'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

/**
 * POST /api/pattie/analyze-figure
 * Pro-gated. Fetches a figure from storage by path and sends to Gemini vision
 * to generate a USPTO-appropriate figure description.
 *
 * Body: { patentId: string, filename: string, figureNumber: number, storagePath: string }
 * Returns: { description: string }
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Tier gate ──────────────────────────────────────────────────────────────
  const tierInfo = await getUserTierInfo(user.id)
  if (!isPro(tierInfo, { isOwner: true, feature: 'pattie' })) {
    return NextResponse.json({
      error: 'This feature requires PatentPending Pro.',
      code: 'TIER_REQUIRED',
      requiredTier: 'pro',
      feature: 'pattie',
    }, { status: 403 })
  }

  let patentId: string, filename: string, figureNumber: number, storagePath: string
  try {
    const body = await req.json()
    patentId = body.patentId
    filename = body.filename
    figureNumber = body.figureNumber ?? 1
    storagePath = body.storagePath
    if (!patentId || !filename || !storagePath) throw new Error('patentId, filename, storagePath required')
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // ── Verify patent ownership ───────────────────────────────────────────────
  const { data: patent } = await supabaseService
    .from('patents')
    .select('id, owner_id, title')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  if (patent.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Vision AI not configured' }, { status: 503 })
  }

  // ── Download figure from storage ──────────────────────────────────────────
  const { data: fileData, error: downloadErr } = await supabaseService.storage
    .from('patent-uploads')
    .download(storagePath)

  if (downloadErr || !fileData) {
    console.error('[analyze-figure] download error:', downloadErr)
    return NextResponse.json({ error: 'Could not load figure from storage' }, { status: 500 })
  }

  // Convert to base64 for Gemini
  const arrayBuffer = await fileData.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // Determine MIME type from filename
  const ext = filename.toLowerCase().split('.').pop() ?? 'png'
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    pdf: 'application/pdf',
  }
  const mimeType = mimeMap[ext] ?? 'image/png'

  // ── Call Gemini vision ────────────────────────────────────────────────────
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

  const systemPrompt = `You are Pattie, a patent assistant. Analyze the uploaded patent figure and write a clear, USPTO-appropriate figure description.

Format: "FIG. ${figureNumber} is a [type of view — e.g., perspective view, cross-sectional view, block diagram, flowchart] showing [what is depicted]. [One additional sentence describing key elements or reference numerals visible in the figure if identifiable]."

Keep it to 1-2 sentences. Use formal patent description language. Do not speculate about elements you cannot see clearly. If reference numerals are visible (e.g., 100, 102, 104), mention the key ones.

The patent title is: "${patent.title}"`

  const geminiBody = {
    contents: [{
      parts: [
        { text: systemPrompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64,
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 256,
    }
  }

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    })

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('[analyze-figure] Gemini error:', err)
      return NextResponse.json({ error: 'Vision analysis failed' }, { status: 500 })
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const rawText = geminiData.candidates?.[0]?.content?.parts
      ?.filter(p => typeof p.text === 'string')
      .map(p => p.text ?? '')
      .join('') ?? ''

    const description = rawText.trim()
    if (!description) {
      return NextResponse.json({ error: 'No description generated' }, { status: 500 })
    }

    return NextResponse.json({ description, figureNumber, filename })

  } catch (err) {
    console.error('[analyze-figure] error:', err)
    return NextResponse.json({ error: 'Vision analysis failed' }, { status: 500 })
  }
}
