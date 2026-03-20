import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ── Type Definitions ──────────────────────────────────────────────────────────

interface ContentPiece {
  day: number
  type: string
  title: string
  purpose: string
  platforms: Record<string, string>
  suggested_visual?: string
}

interface ContentBlast {
  pieces: ContentPiece[]
  marketplace_description: string
  tagline: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function getServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )
}

function buildPrompt(patentTitle: string, founderStoryContent: string, platforms: string[]): string {
  const platformsList = platforms.join(', ')

  return `You are a world-class social media content writer specializing in inventor and founder stories.
You write content that is raw, specific, and human — not polished PR copy.

You have been given a founder story document and patent details. Generate exactly 7 content pieces as specified below.

INVENTOR CONTEXT:
Patent: ${patentTitle}
Founder Story:
${founderStoryContent}

PLATFORMS REQUESTED: ${platformsList}

Generate 7 content pieces. Return ONLY valid JSON — no markdown, no preamble, no explanation.

{
  "pieces": [
    {
      "day": 1,
      "type": "hook_post",
      "title": "Day 1 — The Hook",
      "purpose": "Pure curiosity — introduce the invention without explaining it fully. Stop the scroll.",
      "platforms": {
        "tiktok": "script text — short, punchy, written for speaking aloud. Mark pauses with [pause]. Mark emphasis with CAPS.",
        "linkedin": "text — 150-200 words, personal, no hashtag spam",
        "facebook": "text — conversational, 100-150 words",
        "reddit": "title: [title text]\\nbody: [body text] — honest, no pitch until the end",
        "youtube": "script text — YouTube Short, 45-60 seconds when read aloud",
        "twitter": "text — under 280 chars",
        "email": "subject: [subject]\\nbody: [body text]"
      },
      "suggested_visual": "Brief description of what to show on screen or photograph"
    },
    {
      "day": 2,
      "type": "pain_list",
      "title": "Day 2 — The Pain List",
      "purpose": "Relatable frustration post. List the specific USPTO pain points. Inventors nod along. Lawyers wince. Everyone shares.",
      "platforms": {}
    },
    {
      "day": 3,
      "type": "founder_story",
      "title": "Day 3 — The Founder Story",
      "purpose": "Raw narrative. How the invention and the tool were born from the same frustration. The double story.",
      "platforms": {}
    },
    {
      "day": 4,
      "type": "behind_the_scenes",
      "title": "Day 4 — Behind the Scenes",
      "purpose": "Show Pattie in action. What the AI interview looked like. Make the tool tangible.",
      "platforms": {}
    },
    {
      "day": 5,
      "type": "objection_handler",
      "title": "Day 5 — Can I Really Do This Without a Lawyer?",
      "purpose": "Answer the #1 objection head-on. Honest — not dismissive of attorneys. Pro Se is valid AND attorneys benefit too.",
      "platforms": {}
    },
    {
      "day": 6,
      "type": "vision",
      "title": "Day 6 — The Vision",
      "purpose": "Emotional. The 5-year dream. Why this invention matters beyond the patent. Inspires sharing.",
      "platforms": {}
    },
    {
      "day": 7,
      "type": "video_script",
      "title": "Day 7 — The Video",
      "purpose": "Full talking-head script. 60-90 seconds at natural pace. Written for someone who has never been on camera.",
      "platforms": {
        "video_script": "Full script. Format:\\n[HOOK - 5 seconds]\\n...\\n[STORY - 30 seconds]\\n...\\n[PAYOFF - 15 seconds]\\n...\\n[CTA - 10 seconds: say patentpending.app]",
        "tiktok": "Same script adapted for TikTok — add text overlay suggestions in [brackets]",
        "youtube": "Same script adapted for YouTube Shorts or 3-5 min expanded version",
        "facebook": "Video caption — 50 words max"
      },
      "suggested_visual": "What to wear, what background works, what to hold or show on camera"
    }
  ],
  "marketplace_description": "150-200 word description for the patent marketplace page — human, compelling, non-technical. Attracts licensing inquiries.",
  "tagline": "Single memorable one-liner under 12 words"
}

RULES:
- Only generate platform versions for the platforms in PLATFORMS REQUESTED. For unrequested platforms, omit the key entirely.
- Every piece ends naturally with "→ patentpending.app"
- Write video script for someone who is NOT a professional presenter. Short sentences. Natural.
- Never use: "groundbreaking", "revolutionary", "game-changing", "innovative"
- Pull real quotes and specific details from the founder story — do not genericize
- The "1957 Chevy vs Cadillac" analogy goes in Day 3 or Day 7 if present in the founder story
- "Their eyes aren't broken, they just need a little help" — if present in the founder story, use as the Day 1 hook`
}

function formatBlastAsMarkdown(blast: ContentBlast): string {
  const lines: string[] = ['# Content Blast\n']
  for (const piece of blast.pieces) {
    lines.push(`## ${piece.title}\n`)
    lines.push(`**Purpose:** ${piece.purpose}\n`)
    for (const [platform, text] of Object.entries(piece.platforms)) {
      lines.push(`### ${platform.charAt(0).toUpperCase() + platform.slice(1)}\n\`\`\`\n${text}\n\`\`\`\n`)
    }
    if (piece.suggested_visual) {
      lines.push(`**Visual suggestion:** ${piece.suggested_visual}\n`)
    }
  }
  lines.push(`## Marketplace Description\n${blast.marketplace_description}\n`)
  lines.push(`## Tagline\n> "${blast.tagline}"`)
  return lines.join('\n')
}

// ── Route Handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/patents/[id]/content-blast
 * Auth: patent owner only + isPro() check
 * Body: { platforms?: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userClient = getUserClient(token)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const userId = user.id

  // ── isPro check ───────────────────────────────────────────────────────────
  const { data: profileData } = await supabase
    .from('patent_profiles')
    .select('subscription_status')
    .eq('id', userId)
    .single()

  const subscriptionStatus = profileData?.subscription_status ?? 'free'
  const isPro = subscriptionStatus === 'pro' || subscriptionStatus === 'complimentary'

  if (!isPro) {
    return NextResponse.json(
      { error: 'upgrade_required', message: 'Content Blast is a Pro feature' },
      { status: 403 }
    )
  }

  // ── Fetch patent ──────────────────────────────────────────────────────────
  const { data: patent, error: patentError } = await supabase
    .from('patents')
    .select('id, owner_id, title, description, abstract')
    .eq('id', patentId)
    .single()

  if (patentError || !patent) {
    return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  }

  if (patent.owner_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Payment check — content_blast_purchased_at must be set ───────────────
  const { data: patentForCheck } = await supabase
    .from('patents')
    .select('content_blast_purchased_at')
    .eq('id', patentId)
    .single()

  if (!patentForCheck?.content_blast_purchased_at) {
    return NextResponse.json(
      { error: 'payment_required', message: 'Purchase Content Blast ($12) to generate content for this patent.' },
      { status: 402 }
    )
  }

  // ── Fetch founder story ───────────────────────────────────────────────────
  const { data: founderStoryRows } = await supabase
    .from('patent_correspondence')
    .select('id, content')
    .eq('patent_id', patentId)
    .contains('tags', ['founder_story'])
    .order('created_at', { ascending: false })
    .limit(1)

  const founderStory = founderStoryRows?.[0] ?? null

  if (!founderStory || !founderStory.content) {
    return NextResponse.json(
      { error: 'no_founder_story', message: 'Complete the Founder Interview first to unlock Content Blast.' },
      { status: 400 }
    )
  }

  // ── Determine platforms ───────────────────────────────────────────────────
  let platforms: string[]

  let body: { platforms?: string[] } = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine
  }

  if (body.platforms && body.platforms.length > 0) {
    platforms = body.platforms
  } else {
    // Query user's profile content_platforms
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('content_platforms')
      .eq('id', userId)
      .single()

    const contentPlatforms = userProfile?.content_platforms as string[] | null
    if (contentPlatforms && contentPlatforms.length > 0) {
      platforms = contentPlatforms
    } else {
      platforms = ['tiktok', 'linkedin', 'reddit']
    }
  }

  // ── Validate Anthropic key ────────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  // ── Build prompt and call Claude ──────────────────────────────────────────
  const prompt = buildPrompt(patent.title ?? 'Untitled Patent', founderStory.content, platforms)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('[content-blast] Anthropic error:', errText)
    return NextResponse.json({ error: 'AI generation failed', message: 'Content generation failed. Please try again.' }, { status: 502 })
  }

  const data = await response.json()
  const rawText: string = data.content?.[0]?.text ?? ''

  // Parse JSON from rawText — strip markdown fences if present
  const cleaned = rawText.replace(/^```json\s*/m, '').replace(/\s*```\s*$/m, '').trim()

  let parsed: ContentBlast
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.error('[content-blast] JSON parse error:', e, '\nRaw text (first 500):', cleaned.slice(0, 500))
    return NextResponse.json({ error: 'parse_error', message: 'AI returned invalid JSON. Please try again.' }, { status: 502 })
  }

  // ── Save to Correspondence — Entry 1: Full Content Blast ──────────────────
  const today = new Date().toISOString().slice(0, 10)

  const { data: blastCorr, error: blastCorrError } = await supabase
    .from('patent_correspondence')
    .insert({
      patent_id: patentId,
      owner_id: userId,
      title: `Content Blast — ${patent.title} — ${today}`,
      content: formatBlastAsMarkdown(parsed),
      type: 'other',
      tags: ['content_blast', 'marketing', 'generated'],
      from_party: 'Pattie',
      to_party: 'Inventor',
      correspondence_date: today,
    })
    .select('id')
    .single()

  if (blastCorrError) {
    console.error('[content-blast] Failed to save content blast correspondence:', blastCorrError)
  }

  // ── Save to Correspondence — Entry 2: Marketplace description ─────────────
  const { data: mktCorr, error: mktCorrError } = await supabase
    .from('patent_correspondence')
    .insert({
      patent_id: patentId,
      owner_id: userId,
      title: `Marketplace Description — ${patent.title}`,
      content: `## Marketplace Description\n\n${parsed.marketplace_description}\n\n## Tagline\n\n> "${parsed.tagline}"`,
      type: 'other',
      tags: ['marketplace', 'marketing', 'generated'],
      from_party: 'Pattie',
      to_party: 'Inventor',
      correspondence_date: today,
    })
    .select('id')
    .single()

  if (mktCorrError) {
    console.error('[content-blast] Failed to save marketplace correspondence:', mktCorrError)
  }

  // ── Return result ─────────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    pieces: parsed.pieces,
    marketplace_description: parsed.marketplace_description,
    tagline: parsed.tagline,
    correspondence_id: blastCorr?.id ?? null,
    marketplace_corr_id: mktCorr?.id ?? null,
  })
}
