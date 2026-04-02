/**
 * POST /api/admin/community-radar
 * Summarizes community radar leads using gpt-4o-mini for cost efficiency.
 * Called by the claw-community-radar cron and admin dashboard.
 *
 * Uses cheap_task routing → gpt-4o-mini (~$0.00015/1k in tokens)
 * vs prior claude-sonnet-4-6 approach (~$0.003/1k = 20x cheaper)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callCheapTask } from '@/lib/ai-router'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}
function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

const RADAR_SYSTEM_PROMPT = `You are a patent community radar analyst for PatentPending.app.
Summarize inventor/IP community posts in 2-3 sentences. Focus on:
- Pain points inventors express (filing complexity, attorney costs, USPTO delays)
- Opportunities for PatentPending.app to provide value
- Engagement quality (high/medium/low)
Be concise and objective. No marketing language.`

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({})) as {
    lead_id?: string
    post_title?: string
    post_body?: string
    batch?: boolean
  }

  // Single lead summarization
  if (body.lead_id || (body.post_title && !body.batch)) {
    const postText = [body.post_title, body.post_body].filter(Boolean).join('\n\n')
    if (!postText) {
      return NextResponse.json({ error: 'post_title or post_body required' }, { status: 400 })
    }

    try {
      const summary = await callCheapTask(
        RADAR_SYSTEM_PROMPT,
        `Summarize this community post:\n\n${postText.slice(0, 1500)}`,
        256,
      )

      if (body.lead_id && summary) {
        await getSvc()
          .from('community_radar_leads')
          .update({ ai_summary: summary, summarized_at: new Date().toISOString() })
          .eq('id', body.lead_id)
      }

      return NextResponse.json({ summary, model: 'gpt-4o-mini' })
    } catch (err) {
      console.error('[community-radar] summarization failed:', err)
      return NextResponse.json({ error: 'Summarization failed' }, { status: 500 })
    }
  }

  // Batch: summarize all unsummarized leads
  if (body.batch) {
    const svc = getSvc()
    const { data: leads } = await svc
      .from('community_radar_leads')
      .select('id, post_title, post_body')
      .is('ai_summary', null)
      .limit(20)

    if (!leads?.length) {
      return NextResponse.json({ summarized: 0, message: 'No unsummarized leads found' })
    }

    let summarized = 0
    for (const lead of leads) {
      try {
        const postText = [lead.post_title, lead.post_body].filter(Boolean).join('\n\n')
        const summary = await callCheapTask(
          RADAR_SYSTEM_PROMPT,
          `Summarize this community post:\n\n${postText.slice(0, 1500)}`,
          256,
        )
        if (summary) {
          await svc
            .from('community_radar_leads')
            .update({ ai_summary: summary, summarized_at: new Date().toISOString() })
            .eq('id', lead.id)
          summarized++
        }
      } catch (err) {
        console.warn(`[community-radar] skipped lead ${lead.id}:`, err)
      }
    }

    return NextResponse.json({ summarized, total: leads.length, model: 'gpt-4o-mini' })
  }

  return NextResponse.json({ error: 'Provide lead_id, post_title, or batch:true' }, { status: 400 })
}
