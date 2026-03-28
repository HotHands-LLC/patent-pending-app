/**
 * POST /api/patents/pattie-intake
 *
 * P-Fix-3c — Pattie New Patent Intake
 *
 * Accepts the 4 answers from the Pattie intake conversation, generates a
 * patent title via Gemini Flash (from Q1 description), creates a
 * provisional_draft patent record, logs pattie_onboarding_complete to
 * patent_activity_log, and returns the new patent_id.
 *
 * Body:
 *   { description: string, type: string, disclosed: string, drawings: string }
 *
 * Returns:
 *   { patent_id: string, title: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTierInfo, getPatentLimit, countUserPatents, patentLimitResponse } from '@/lib/tier'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ── Supabase helpers ──────────────────────────────────────────────────────────

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Gemini title generation ───────────────────────────────────────────────────

async function generateTitle(description: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    // Fallback: derive a basic title from the first sentence
    const first = description.split(/[.!?]/)[0].trim()
    return first.length > 10 ? first : 'Untitled Invention'
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`

  const prompt = `You are a USPTO patent title generator. Generate a concise, professional patent title (5-12 words) for this invention description. The title should be in the style of a formal patent title (e.g. "System and Method for...", "Apparatus for...", "Device and Method for..."). Return ONLY the title — no quotes, no explanation, no period at the end.

Invention description: "${description}"`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 64, temperature: 0.3 },
      }),
    })

    if (!res.ok) throw new Error(`Gemini ${res.status}`)

    const data = await res.json()
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const cleaned = text.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').trim()
    return cleaned.length >= 5 ? cleaned : 'Untitled Invention'
  } catch {
    // Non-blocking — use a fallback title
    const first = description.split(/[.!?]/)[0].trim()
    return first.length > 10 ? first : 'Untitled Invention'
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { description, type, disclosed, drawings } = body as {
    description?: string
    type?: string
    disclosed?: string
    drawings?: string
  }

  if (!description || typeof description !== 'string' || description.trim().length < 5) {
    return NextResponse.json({ error: 'description is required (min 5 chars)' }, { status: 400 })
  }
  if (!type || typeof type !== 'string') {
    return NextResponse.json({ error: 'type is required' }, { status: 400 })
  }

  // ── Patent count gate ─────────────────────────────────────────────────────
  const tierInfo = await getUserTierInfo(user.id)
  const limit = getPatentLimit(tierInfo)
  const currentCount = await countUserPatents(user.id)
  if (currentCount >= limit) {
    return patentLimitResponse(currentCount, limit)
  }

  // ── Generate title via Gemini Flash ───────────────────────────────────────
  const title = await generateTitle(description.trim())

  // ── Map type to a clean value ─────────────────────────────────────────────
  const normalizedType = (type as string).toLowerCase().trim()

  // ── Create patent record ──────────────────────────────────────────────────
  const patentPayload = {
    owner_id: user.id,
    title,
    description: description.trim(),
    status: 'provisional_draft' as const,
    tags: [normalizedType],
    // Store intake context in description for Pattie to use later
    inventors: [],
  }

  const { data: patent, error: insertError } = await supabaseService
    .from('patents')
    .insert(patentPayload)
    .select('id, title')
    .single()

  if (insertError || !patent) {
    console.error('pattie-intake insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create patent record' }, { status: 500 })
  }

  // ── Log onboarding complete (non-blocking, fire-and-forget) ─────────────
  void (async () => {
    try {
      await supabaseService.from('patent_activity_log').insert({
        patent_id: patent.id,
        user_id: user.id,
        event_type: 'pattie_onboarding_complete',
        metadata: {
          intake_answers: {
            description: description.trim(),
            type: normalizedType,
            disclosed: disclosed ?? null,
            drawings: drawings ?? null,
          },
          generated_title: title,
        },
      })
    } catch {
      // Non-blocking — ignore log failures
    }
  })()

  return NextResponse.json({ patent_id: patent.id, title })
}
