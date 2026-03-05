import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Patent Pending <notifications@patentpending.app>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

interface ClaimsReadyEmailParams {
  to: string
  inventorName: string | null
  inventionName: string | null
  patentId: string
}

export async function sendClaimsReadyEmail({
  to,
  inventorName,
  inventionName,
  patentId,
}: ClaimsReadyEmailParams): Promise<void> {
  if (!to) {
    console.warn('[email] sendClaimsReadyEmail: no recipient address — skipping')
    return
  }

  const name = inventorName ?? 'Inventor'
  const title = inventionName ?? 'your invention'
  const patentUrl = `${APP_URL}/dashboard/patents/${patentId}`

  const textBody = `Hi ${name},

Your AI-generated claims draft for "${title}" is ready to review.

View it here: ${patentUrl}

From the patent detail page, you can:
  • Read and review the full claims draft
  • Approve it to move forward with filing
  • Request a revision if anything needs adjustment

If you have any questions, reply to this email.

— Patent Pending
  ${APP_URL}`

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background:#1a1f36;padding:28px 40px;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">⚖️ Patent Pending</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hi ${name},</p>
            <h1 style="margin:0 0 20px;color:#1a1f36;font-size:22px;font-weight:700;line-height:1.3;">
              Your claims draft is ready to review
            </h1>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
              The AI-generated claims draft for <strong>${title}</strong> has been prepared and is waiting for your review.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#1a1f36;border-radius:8px;">
                  <a href="${patentUrl}"
                     style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                    Review My Claims Draft →
                  </a>
                </td>
              </tr>
            </table>
            <!-- What you can do -->
            <p style="margin:0 0 12px;color:#1a1f36;font-size:14px;font-weight:600;">From the patent page you can:</p>
            <ul style="margin:0 0 28px;padding-left:20px;color:#374151;font-size:14px;line-height:2;">
              <li>Read and review the full claims draft</li>
              <li>Approve it to move forward with filing</li>
              <li>Request a revision if anything needs adjustment</li>
            </ul>
            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
              Questions? Reply to this email and we'll get back to you.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              Patent Pending &nbsp;·&nbsp;
              <a href="${APP_URL}" style="color:#9ca3af;">patentpending.app</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: 'Your claims draft is ready to review',
      text: textBody,
      html: htmlBody,
    })

    if (error) {
      console.error('[email] Resend error:', error)
    } else {
      console.log(`[email] ✅ claims-ready email sent to ${to} — id: ${data?.id}`)
    }
  } catch (err) {
    // Never throw — email failure must not crash the cron job
    console.error('[email] sendClaimsReadyEmail unexpected error:', err)
  }
}
