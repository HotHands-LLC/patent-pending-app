import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const GEMINI_FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * POST /api/patents/[id]/pattie-opening
 *
 * Generates a contextual one-sentence opening message for Pattie based on:
 *  - Last 3 patent_activity_log entries
 *  - np_filing_steps status
 *  - figures_confirmed flag (from np_filing_steps.figures)
 *  - Deadline urgency
 *
 * Saves as patent_chat_messages with actor='pattie', message_type='opening'.
 * Returns { message: string, savedId?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params

  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = getSvc()

  // ── Fetch patent ────────────────────────────────────────────────────────────
  const { data: patent } = await svc
    .from('patents')
    .select('id, owner_id, title, provisional_deadline, np_filing_steps, figures_uploaded, filing_status, status')
    .eq('id', patentId)
    .single()

  if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Access check — owner or accepted collaborator
  if (patent.owner_id !== user.id) {
    const { data: collab } = await svc
      .from('patent_collaborators')
      .select('id')
      .eq('patent_id', patentId)
      .not('accepted_at', 'is', null)
      .or(`user_id.eq.${user.id},invited_email.eq.${user.email ?? ''}`)
      .limit(1)
      .single()
    if (!collab) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Check if an opening already exists for today (avoid re-generating each load) ──
  // message_type column may not exist yet — use try/catch for safety
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: existingOpening } = await svc
      .from('patent_chat_messages')
      .select('id, content')
      .eq('patent_id', patentId)
      .eq('role', 'assistant')
      .eq('message_type', 'opening')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existingOpening) {
      return NextResponse.json({ message: existingOpening.content, savedId: existingOpening.id, cached: true })
    }
  } catch { /* column may not exist — skip cache check */ }

  // ── Fetch last 3 activity entries ──────────────────────────────────────────
  const { data: recentActivity } = await svc
    .from('patent_activity_log')
    .select('action_type, summary, created_at')
    .eq('patent_id', patentId)
    .order('created_at', { ascending: false })
    .limit(3)

  // ── Derive status signals ──────────────────────────────────────────────────
  const npSteps = (patent.np_filing_steps ?? {}) as Record<string, boolean>
  const figuresConfirmed = !!npSteps.figures
  const specConfirmed = !!npSteps.spec_confirmed
  const idsConfirmed = !!npSteps.ids_confirmed
  const adsGenerated = !!npSteps.ads_generated
  const filedAtUspTo = !!npSteps.filed_at_uspto

  const deadline = patent.provisional_deadline
  const daysLeft = deadline
    ? Math.ceil((new Date(deadline + 'T00:00:00').getTime() - Date.now()) / 86400000)
    : null

  const allGreen = figuresConfirmed && specConfirmed && idsConfirmed && adsGenerated && filedAtUspTo
  const patentName = patent.title ?? 'your patent'

  // ── Simple rule-based fallback (no AI needed for obvious cases) ────────────
  function ruleBasedMessage(): string | null {
    if (!figuresConfirmed && patent?.figures_uploaded) {
      return `Your spec looks strong — let's sort out those figures before the deadline.`
    }
    if (daysLeft !== null && daysLeft < 7 && daysLeft >= 0) {
      return `⚠️ You're ${daysLeft} day${daysLeft !== 1 ? 's' : ''} from your deadline. Let's make sure everything is ready.`
    }
    if (allGreen) {
      return `Everything looks good on ${patentName}. What do you want to work on today?`
    }
    return null
  }

  const ruleMsg = ruleBasedMessage()

  // ── For default cases, use Gemini Flash ───────────────────────────────────
  let opening: string

  if (ruleMsg) {
    opening = ruleMsg
  } else if (process.env.GEMINI_API_KEY) {
    const activityContext = (recentActivity ?? [])
      .map(a => `- ${a.action_type}: ${a.summary}`)
      .join('\n') || '(no recent activity)'

    const prompt = `You are Pattie, a friendly patent assistant for PatentPending.app.
Generate a single warm, concise opening sentence to greet the patent holder when they open the patent page.

Patent: "${patentName}"
Filing status: ${patent.filing_status ?? patent.status ?? 'unknown'}
Days until deadline: ${daysLeft !== null ? `${daysLeft}d` : 'N/A'}
Figures confirmed: ${figuresConfirmed}
Spec confirmed: ${specConfirmed}
IDS confirmed: ${idsConfirmed}
ADS generated: ${adsGenerated}
Filed at USPTO: ${filedAtUspTo}

Recent activity:
${activityContext}

Rules:
- ONE sentence max, conversational, warm
- If figures not confirmed but uploaded: mention figures + deadline
- If deadline < 7 days: lead with urgency (use ⚠️)
- If all steps green: celebrate and ask what to work on
- Default: friendly offer to help with [name]
- Never mention AI or that you're generating a message
- Do not use quotation marks around the response

Reply with just the opening sentence. Nothing else.`

    try {
      const gemRes = await fetch(GEMINI_FLASH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
        }),
      })
      const gemData = await gemRes.json()
      const raw = gemData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
      opening = raw || `Hi! I'm Pattie. Tell me about ${patentName} — where would you like to start?`
    } catch {
      opening = `Hi! I'm Pattie. Tell me about ${patentName} — where would you like to start?`
    }
  } else {
    opening = `Hi! I'm Pattie. Tell me about ${patentName} — where would you like to start?`
  }

  // ── Save to patent_chat_messages (non-critical — table/columns may not all exist) ──
  let savedId: string | undefined
  try {
    // Try with message_type first
    const { data: saved, error: insertErr } = await svc
      .from('patent_chat_messages')
      .insert({
        patent_id:    patentId,
        user_id:      user.id,
        role:         'assistant',
        content:      opening,
        message_type: 'opening',
        session_id:   `opening-${patentId}-${Date.now()}`,
      })
      .select('id')
      .single()
    if (!insertErr) savedId = saved?.id
    else {
      // Retry without message_type in case column doesn't exist
      const { data: saved2 } = await svc
        .from('patent_chat_messages')
        .insert({
          patent_id:  patentId,
          user_id:    user.id,
          role:       'assistant',
          content:    opening,
          session_id: `opening-${patentId}-${Date.now()}`,
        })
        .select('id')
        .single()
      savedId = saved2?.id
    }
  } catch { /* non-critical */ }

  return NextResponse.json({ message: opening, savedId })
}
