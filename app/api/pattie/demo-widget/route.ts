/**
 * POST /api/pattie/demo-widget
 * Public (no auth). Homepage Pattie chat — Gemini Flash only.
 * Unlimited messages (revenue gate is handled client-side at milestone).
 * Rate limit: 60 requests per hour per IP (in-memory, resets on cold start).
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ── Rate limiter ──────────────────────────────────────────────────────────────
const ipCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 60
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = ipCounts.get(ip)
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT - 1 }
  }
  if (entry.count >= RATE_LIMIT) return { allowed: false, remaining: 0 }
  entry.count++
  return { allowed: true, remaining: RATE_LIMIT - entry.count }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// ── Demo system prompt ────────────────────────────────────────────────────────
const DEMO_SYSTEM_PROMPT =
  'You are Pattie, an AI patent assistant from PatentPending.app. You help inventors understand the patent process, assess their invention\'s patentability, and draft initial patent claims. You are warm, encouraging, and expert. Keep responses concise — 2-4 sentences unless the user asks for detail. Ask one clarifying question at a time to help the inventor develop their idea. After discussing the concept for several turns, naturally encourage them to sign up at PatentPending.app to generate a full draft specification and filing roadmap.'

// ── Gemini Flash call ─────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

interface GeminiMessage {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

async function callGeminiFlash(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  // Convert messages to Gemini format (assistant → model)
  const geminiMessages: GeminiMessage[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const payload = {
    system_instruction: {
      parts: [{ text: DEMO_SYSTEM_PROMPT }],
    },
    contents: geminiMessages,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.7,
    },
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[demo-widget] Gemini API error:', res.status, errText.slice(0, 200))
    throw new Error(`Gemini API error: ${res.status}`)
  }

  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) throw new Error('Empty response from Gemini')
  return text
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip)

  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit reached. Please try again later.' },
      { status: 429 }
    )
  }

  let body: {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    session_id?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const messages = (body.messages ?? []).filter(
    m => m.role && m.content && typeof m.content === 'string'
  )

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'No user message provided' }, { status: 400 })
  }

  try {
    const reply = await callGeminiFlash(messages)

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[demo-widget] Error:', err)
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please try again.' },
      { status: 503 }
    )
  }
}
