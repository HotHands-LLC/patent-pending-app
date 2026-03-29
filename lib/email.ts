/**
 * Shared email utilities for PatentPending
 * - Consistent from name ("Chad at PatentPending")
 * - Plain-text version alongside HTML (improves deliverability)
 * - Unsubscribe/reply footer on every email
 */

export const FROM_DEFAULT = 'Chad at PatentPending <notifications@patentpending.app>'
export const FROM_ADMIN = 'Chad at PatentPending <notifications@hotdeck.com>'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

/** Wraps HTML with standard footer */
export function withFooter(html: string, unsubUrl?: string): string {
  const unsub = unsubUrl ?? `${APP_URL}/unsubscribe`
  return `${html}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;font-family:Arial,sans-serif;">
  <p>PatentPending · <a href="${APP_URL}" style="color:#6366f1">patentpending.app</a></p>
  <p>Questions? Reply to this email or contact <a href="mailto:support@hotdeck.com" style="color:#6366f1">support@hotdeck.com</a></p>
  <p><a href="${unsub}" style="color:#9ca3af">Unsubscribe</a></p>
</div>`
}

/** Strips HTML tags for plain-text fallback */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Build a Resend-compatible email payload with html + text */
export function buildEmail({
  to,
  subject,
  html,
  from = FROM_DEFAULT,
  replyTo = 'support@hotdeck.com',
}: {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}) {
  const htmlWithFooter = withFooter(html)
  return {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html: htmlWithFooter,
    text: htmlToText(htmlWithFooter),
    reply_to: replyTo,
  }
}

/** Send via Resend — returns { id } or throws */
export async function sendEmail(payload: ReturnType<typeof buildEmail>): Promise<{ id: string }> {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`)
  }
  return res.json()
}

/** Legacy convenience: claims ready notification (used by generate-claims cron) */
export async function sendClaimsReadyEmail({
  to,
  inventorName,
  inventionName,
  patentId,
}: {
  to: string
  inventorName?: string | null
  inventionName?: string | null
  patentId: string
}) {
  if (!to || !process.env.RESEND_API_KEY) return
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
  const name = inventorName ?? 'Inventor'
  const title = inventionName ?? 'your invention'
  const patentUrl = `${appUrl}/dashboard/patents/${patentId}?tab=claims`

  await sendEmail(buildEmail({
    to,
    from: FROM_DEFAULT,
    subject: `Your patent claims are ready — ${title}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">Your claims draft is ready 🎉</h2>
  <p>Hi ${name},</p>
  <p>We've generated an initial claims draft for <strong>${title}</strong>.</p>
  <p>Review your claims, request revisions, or proceed to the filing checklist.</p>
  <p><a href="${patentUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Your Claims →</a></p>
</div>`,
  }))
}
