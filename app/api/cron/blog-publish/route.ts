/**
 * GET /api/cron/blog-publish
 * Blog auto-publish cron — publishes 1 oldest draft blog post per run.
 *
 * Schedule: 0 12 * * 2-6  (12:00 UTC = 7:00 AM CT, Tuesday–Saturday)
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Behavior:
 *  - Finds the oldest draft post (by created_at ASC)
 *  - Sets status = 'published', published_at = now
 *  - Logs to social_post_log
 *  - Sends Telegram if no drafts remain
 *
 * Returns: { published?: { id, slug, title }, queue_remaining: N } | { no_drafts: true }
 *
 * No module-level Supabase client. (Standing rule.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// ── Auth ──────────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return false
  const cronSecret = process.env.CRON_SECRET
  const svcKey     = process.env.SUPABASE_SERVICE_ROLE_KEY
  return (!!cronSecret && token === cronSecret) || (!!svcKey && token === svcKey)
}

// ── Telegram ──────────────────────────────────────────────────────────────────
async function sendTelegram(text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId   = process.env.TELEGRAM_CHAT_ID ?? '6733341890'
  if (!botToken) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    const d = await res.json() as { ok: boolean }
    return d.ok
  } catch {
    return false
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BlogPost {
  id:         string
  slug:       string
  title:      string
  category:   string | null
  word_count: number | null
  created_at: string
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── 1. Find oldest draft ────────────────────────────────────────────────────
  const { data: drafts, error: fetchErr } = await svc
    .from('blog_posts')
    .select('id, slug, title, category, word_count, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(10)

  if (fetchErr) {
    console.error('[blog-publish] fetch error:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const queue = (drafts ?? []) as BlogPost[]

  // ── 2. No drafts — send Telegram alert ────────────────────────────────────
  if (queue.length === 0) {
    const msg = '⚠️ Blog queue empty — no post for tomorrow'
    console.warn('[blog-publish]', msg)
    await sendTelegram(msg)
    return NextResponse.json({ no_drafts: true, message: msg })
  }

  const post = queue[0]
  const publishedAt = new Date().toISOString()

  // ── 3. Publish the oldest draft ───────────────────────────────────────────
  const { error: updateErr } = await svc
    .from('blog_posts')
    .update({ status: 'published', published_at: publishedAt, updated_at: publishedAt })
    .eq('id', post.id)

  if (updateErr) {
    console.error('[blog-publish] update error:', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── 4. Log to social_post_log ─────────────────────────────────────────────
  await svc.from('social_post_log').insert({
    brand:       'PatentPending.app',
    platform:    'blog',
    post_type:   'blog_post',
    content:     post.title,
    content_title: post.title,
    post_url:    `https://patentpending.app/blog/${post.slug}`,
    posted_at:   publishedAt,
  })

  // ── 5. Telegram success notification (queue remaining) ───────────────────
  const remaining = queue.length - 1
  const tgMsg = `📝 <b>Blog post published</b>\n"${post.title}"\n/blog/${post.slug}\n\n📚 Queue remaining: ${remaining} draft${remaining !== 1 ? 's' : ''}`
  await sendTelegram(tgMsg)

  console.log(`[blog-publish] Published: ${post.id} — "${post.title}"`)

  return NextResponse.json({
    published: {
      id:    post.id,
      slug:  post.slug,
      title: post.title,
    },
    published_at:    publishedAt,
    queue_remaining: remaining,
  })
}
