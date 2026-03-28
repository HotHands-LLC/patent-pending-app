/**
 * POST /api/patents/intake
 *
 * P-Fix-3c — canonical intake endpoint.
 *
 * Accepts: { description, type, public_disclosure, has_drawings }
 * Returns: { patent_id, title }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserTierInfo, getPatentLimit, countUserPatents, patentLimitResponse } from '@/lib/tier'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

async function generateTitle(description: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    const first = description.split(/[.!?]/)[0].trim()
    return first.length > 10 ? first.slice(0, 60) : 'Untitled Invention'
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
  const prompt = `You are a USPTO patent title generator. Generate a concise, professional patent title (5-12 words) for this invention description. The title should be in the style of a formal patent title (e.g. "System and Method for...", "Apparatus for...", "Device and Method for..."). Return ONLY the title — no quotes, no explanation, no period at the end.\n\nInvention description: "${description}"`

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
    const first = description.split(/[.!?]/)[0].trim()
    return first.length > 10 ? first.slice(0, 60) : 'Untitled Invention'
  }
}

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

  // Accept both naming conventions (public_disclosure / disclosed, has_drawings / drawings)
  const description = body.description as string | undefined
  const type = body.type as string | undefined
  const public_disclosure = (body.public_disclosure ?? body.disclosed) as string | undefined
  const has_drawings = (body.has_drawings ?? body.drawings) as string | undefined

  if (!description || typeof description !== 'string' || description.trim().length < 5) {
    return NextResponse.json({ error: 'description is required (min 5 chars)' }, { status: 400 })
  }
  if (!type || typeof type !== 'string') {
    return NextResponse.json({ error: 'type is required' }, { status: 400 })
  }

  // Patent count gate
  const tierInfo = await getUserTierInfo(user.id)
  const limit = getPatentLimit(tierInfo)
  const currentCount = await countUserPatents(user.id)
  if (currentCount >= limit) {
    return patentLimitResponse(currentCount, limit)
  }

  const title = await generateTitle(description.trim())
  const normalizedType = type.toLowerCase().trim()

  const { data: patent, error: insertError } = await supabaseService
    .from('patents')
    .insert({
      owner_id: user.id,
      title,
      description: description.trim(),
      status: 'provisional_draft',
      tags: [normalizedType],
      inventors: [],
    })
    .select('id, title')
    .single()

  if (insertError || !patent) {
    console.error('intake insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create patent record' }, { status: 500 })
  }

  // Log pattie_intake_complete (non-blocking)
  supabaseService
    .from('patent_activity_log')
    .insert({
      patent_id: patent.id,
      user_id: user.id,
      event_type: 'pattie_intake_complete',
      metadata: {
        intake_answers: {
          description: description.trim(),
          type: normalizedType,
          public_disclosure: public_disclosure ?? null,
          has_drawings: has_drawings ?? null,
        },
        generated_title: title,
      },
    })
    .then(() => {/* ok */}, () => {/* non-blocking */})

  return NextResponse.json({ patent_id: patent.id, title })
}
