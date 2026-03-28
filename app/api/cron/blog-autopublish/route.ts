/**
 * GET /api/cron/blog-autopublish
 *
 * Publishes the oldest draft blog post (by created_at) once per run.
 * Schedule: daily at 12:00 UTC (7:00 AM CT) — Tuesday through Saturday
 *   vercel.json cron: "0 12 * * 2-6"
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * On publish:
 *   - Sets status='published' + published_at=now() on the blog_posts row
 *   - Inserts a row into social_post_log (platform='blog', status='published')
 *   - If no drafts remain, sends a Telegram alert to the admin chat
 *
 * No module-level Supabase client. (Standing rule.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ── Telegram helper ──────────────────────────────────────────────────────────
async function sendTelegram(text: string) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '6733341890'
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch (err) {
    console.error('[blog-autopublish] Telegram send failed:', err)
  }
}

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader   = req.headers.get('authorization')
  const querySecret  = req.nextUrl.searchParams.get('secret')
  const expected     = process.env.CRON_SECRET

  if (!expected) {
    console.error('[blog-autopublish] CRON_SECRET not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : querySecret
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Fetch oldest draft ───────────────────────────────────────────────────
  const { data: drafts, error: fetchErr } = await svc
    .from('blog_posts')
    .select('id, title, slug, category')
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(1)

  if (fetchErr) {
    console.error('[blog-autopublish] fetch error:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  // ── No drafts — alert and exit ───────────────────────────────────────────
  if (!drafts || drafts.length === 0) {
    console.warn('[blog-autopublish] No drafts in queue')
    await sendTelegram('⚠️ Blog queue empty — no post for tomorrow')
    return NextResponse.json({ published: null, message: 'Queue empty — Telegram alert sent' })
  }

  const post = drafts[0]
  const now  = new Date().toISOString()

  // ── Publish ──────────────────────────────────────────────────────────────
  const { error: updateErr } = await svc
    .from('blog_posts')
    .update({ status: 'published', published_at: now })
    .eq('id', post.id)

  if (updateErr) {
    console.error('[blog-autopublish] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── Log to social_post_log ───────────────────────────────────────────────
  const postUrl = `https://patentpending.app/blog/${post.slug}`

  const { error: logErr } = await svc.from('social_post_log').insert({
    brand:          'patentpending',
    platform:       'blog',
    post_type:      'article',
    content_title:  post.title,
    post_url:       postUrl,
    posted_at:      now,
  })

  if (logErr) {
    // Non-fatal — log but don't fail the cron
    console.warn('[blog-autopublish] social_post_log insert failed:', logErr.message)
  }

  // ── Check remaining drafts ───────────────────────────────────────────────
  const { count: remaining } = await svc
    .from('blog_posts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft')

  if (remaining === 0) {
    await sendTelegram('⚠️ Blog queue empty — no post for tomorrow')
  }

  console.log(`[blog-autopublish] Published: "${post.title}" → ${postUrl}`)

  return NextResponse.json({
    published: { id: post.id, title: post.title, slug: post.slug, url: postUrl },
    drafts_remaining: remaining ?? 0,
  })
}
