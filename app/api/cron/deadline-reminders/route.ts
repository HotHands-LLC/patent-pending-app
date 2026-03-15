import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

// ── Auth ─────────────────────────────────────────────────────────────────────
// Vercel sets Authorization: Bearer <CRON_SECRET> automatically on cron invocations.
// Manual trigger: pass the same header, or SUPABASE_SERVICE_ROLE_KEY as fallback.
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return false
  const cronSecret = process.env.CRON_SECRET
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return (!!cronSecret && token === cronSecret) || (!!svcKey && token === svcKey)
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PatentRow { title: string }
interface DeadlineRow {
  id: string
  patent_id: string
  deadline_type: string
  due_date: string
  alerts_sent: number[] | null
  notes: string | null
  patents: PatentRow | null
}

const ALERT_THRESHOLDS = [90, 60, 30, 14, 7, 3, 1]

const CHAD_EMAIL = 'support@hotdeck.com'
const FROM_ADDR  = 'PatentPending <notifications@patentpending.app>'

// ── Telegram helper (optional — requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) ──
async function sendTelegram(text: string): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '6733341890'
  if (!token) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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

// ── Main ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'),
    { global: { headers: { 'User-Agent': 'BoClaw/1.0' } } }
  )

  const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder-resend-key')

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const isMonday = today.getUTCDay() === 1

  // ── Fetch pending deadlines ─────────────────────────────────────────────────
  const { data: deadlines, error } = await supabase
    .from('patent_deadlines')
    .select('id, patent_id, deadline_type, due_date, alerts_sent, notes, patents(title)')
    .eq('status', 'pending')
    .order('due_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (deadlines ?? []) as unknown as DeadlineRow[]

  let alertsSent = 0
  const weeklyLines: string[] = []
  const log: string[] = [`[${todayStr}] deadline-reminders — ${rows.length} pending deadline(s)`]

  for (const dl of rows) {
    const patentTitle = dl.patents?.title ?? 'Unknown Patent'
    const dueDate     = new Date(dl.due_date + 'T00:00:00Z')
    const daysUntil   = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000)
    const alertsSentArr: number[] = Array.isArray(dl.alerts_sent) ? dl.alerts_sent : []
    const deadlineLabel = dl.deadline_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    // Weekly summary line
    const urgency = daysUntil <= 30 ? '🔴' : daysUntil <= 90 ? '🟡' : '🟢'
    weeklyLines.push(`${urgency} ${patentTitle} — ${deadlineLabel}: ${dl.due_date} (${daysUntil} days)`)
    log.push(`  [${daysUntil}d] ${patentTitle} — ${deadlineLabel} | already_sent=${alertsSentArr}`)

    // Threshold alerts
    for (const threshold of ALERT_THRESHOLDS) {
      if (daysUntil !== threshold) continue
      if (alertsSentArr.includes(threshold)) continue

      const alertText =
        `⚠️ <b>DEADLINE ALERT — ${daysUntil} day${daysUntil === 1 ? '' : 's'}</b>\n\n` +
        `Patent: ${patentTitle}\n` +
        `Type: ${deadlineLabel}\n` +
        `Due: ${dl.due_date}\n\n` +
        `→ patentpending.app/dashboard`

      const alertSubject = `⚠️ ${daysUntil}-day deadline: ${patentTitle} (${deadlineLabel})`
      const alertHtml    = alertText
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>')
        .replace(/<b>(.*?)<\/b>/g, '<strong>$1</strong>')

      // Send email via Resend
      let emailOk = false
      try {
        await resend.emails.send({
          from: FROM_ADDR,
          to: [CHAD_EMAIL],
          subject: alertSubject,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px">
            <div style="background:#1a1f36;color:white;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">⚠️ Patent Deadline Alert</h2>
            </div>
            <div style="background:white;border:1px solid #e5e7eb;padding:20px;border-radius:0 0 8px 8px">
              <p><strong>${daysUntil} day${daysUntil === 1 ? '' : 's'} remaining</strong></p>
              <p><strong>Patent:</strong> ${patentTitle}</p>
              <p><strong>Type:</strong> ${deadlineLabel}</p>
              <p><strong>Due:</strong> ${dl.due_date}</p>
              ${dl.notes ? `<p><strong>Notes:</strong> ${dl.notes}</p>` : ''}
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
              <a href="https://patentpending.app/dashboard" style="display:inline-block;padding:12px 24px;background:#1a1f36;color:white;text-decoration:none;border-radius:8px;font-weight:bold">
                Open Dashboard →
              </a>
            </div>
          </div>`,
          text: alertText.replace(/<[^>]*>/g, ''),
        })
        emailOk = true
      } catch (e) {
        log.push(`  ❌ Resend error: ${e}`)
      }

      // Also send Telegram if token is configured
      const tgOk = await sendTelegram(alertText)

      if (emailOk || tgOk) {
        const newAlerts = [...alertsSentArr, threshold]
        await supabase
          .from('patent_deadlines')
          .update({ alerts_sent: newAlerts })
          .eq('id', dl.id)
        alertsSent++
        log.push(`  ✅ Alert sent (email=${emailOk} tg=${tgOk}) threshold=${threshold}`)
      }
    }
  }

  // ── Weekly Monday summary → review_queue ────────────────────────────────────
  if (isMonday && weeklyLines.length > 0) {
    const summary = `Weekly Deadline Summary — ${todayStr}\n\n${weeklyLines.join('\n')}`
    await supabase.from('review_queue').insert({
      owner_id: '8c11a80b-2a67-4e52-a151-a524ffca145e',
      draft_type: 'misc',
      title: `patentpending.app — Weekly Deadline Summary (${todayStr})`,
      content: summary,
      version: 1,
      status: 'pending',
      submitted_by: 'boclaw',
    })
    log.push(`  📋 Weekly summary logged to review_queue (${weeklyLines.length} items)`)
  }

  log.push(`Done. Checked: ${rows.length} | Alerts sent: ${alertsSent}`)
  console.log(log.join('\n'))

  return NextResponse.json({
    ok: true,
    date: todayStr,
    deadlines_checked: rows.length,
    alerts_sent: alertsSent,
    log,
  })
}
