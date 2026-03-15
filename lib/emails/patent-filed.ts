/**

 * lib/emails/patent-filed.ts
 *
 * Congratulations email sent when a patent is marked as filed
 * (filing_status → 'provisional_filed').
 *
 * Design:
 * - Dark navy header bar with PatentPending wordmark
 * - "You're in the 1%" as emotional hook
 * - Filing details in a clean info block
 * - What Patent Pending means: 4 bullet points
 * - What's Next: AI research / Marketplace / Non-prov guide
 * - Pattie CTA button → links to patent detail page
 * - Single column, max-width 600px, inline styles throughout
 * - Transactional email — no unsubscribe required
 */

const APP_URL = 'https://patentpending.app'

export interface PatentFiledEmailParams {
  inventorFirstName: string
  patentTitle: string
  appNumber: string
  filingDate: string        // e.g. "March 12, 2026"
  nonprovDeadline: string   // e.g. "March 12, 2027"
  patentId: string
  appUrl?: string
}

export function buildFiledEmail(params: PatentFiledEmailParams): string {
  const {
    inventorFirstName,
    patentTitle,
    appNumber,
    filingDate,
    nonprovDeadline,
    patentId,
    appUrl = APP_URL,
  } = params

  const patentUrl = `${appUrl}/patents/${patentId}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your patent is officially Patent Pending</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- ── Header bar ─────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#1a1f36;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">Patent<span style="color:#818cf8;">Pending</span></span>
                    <span style="color:#4f46e5;font-size:11px;font-weight:600;letter-spacing:1px;margin-left:10px;vertical-align:middle;">APP</span>
                  </td>
                  <td align="right">
                    <span style="color:#6366f1;font-size:22px;">🎉</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Hero: the 1% stat ──────────────────────────────────────── -->
          <tr>
            <td style="padding:36px 32px 24px 32px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 8px 0;font-size:28px;font-weight:900;color:#1a1f36;line-height:1.1;">You&rsquo;re in the 1%.</p>
              <p style="margin:0 0 20px 0;font-size:15px;color:#6b7280;line-height:1.5;">
                Less than 1% of people will ever file a patent. You just did.
              </p>
              <p style="margin:0 0 6px 0;font-size:17px;font-weight:700;color:#1a1f36;">
                ${escHtml(patentTitle)}
              </p>
              <p style="margin:0;font-size:14px;color:#6b7280;">is now officially <strong style="color:#059669;">Patent Pending</strong> with the USPTO.</p>
            </td>
          </tr>

          <!-- ── Filing details block ───────────────────────────────────── -->
          <tr>
            <td style="padding:24px 32px;background-color:#f8fafc;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${detailRow('Application No.', appNumber)}
                ${detailRow('Filed', filingDate)}
                ${detailRow('Protected until', `${nonprovDeadline} <span style="color:#6b7280;font-size:12px;">(12 months)</span>`)}
              </table>
            </td>
          </tr>

          <!-- ── What Patent Pending means ─────────────────────────────── -->
          <tr>
            <td style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 16px 0;font-size:15px;font-weight:700;color:#1a1f36;">What &ldquo;Patent Pending&rdquo; means for you:</p>
              ${checkItem('Your invention is legally protected from the filing date')}
              ${checkItem('You can publicly disclose, demo, and market your invention')}
              ${checkItem('You can label products and listings &ldquo;Patent Pending&rdquo;')}
              ${checkItem('You have 12 months to file your full (non-provisional) application')}
            </td>
          </tr>

          <!-- ── What's next ────────────────────────────────────────────── -->
          <tr>
            <td style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 16px 0;font-size:15px;font-weight:700;color:#1a1f36;">What&rsquo;s next?</p>
              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                The next 12 months are about making your patent stronger &mdash; and PatentPending is here every step of the way.
              </p>
              ${nextItem('🔬', 'Monthly AI Research', 'Each month, our AI researches new prior art and suggests ways to make your claims more defensible.')}
              ${nextItem('🏪', 'Marketplace', 'List your patent to attract licensees and buyers &mdash; right now, while it\'s Patent Pending.')}
              ${nextItem('📋', 'Non-Provisional Guide', 'When you\'re ready, we\'ll guide you through the full non-provisional application step by step.')}
            </td>
          </tr>

          <!-- ── Pattie CTA ─────────────────────────────────────────────── -->
          <tr>
            <td style="padding:28px 32px;border-bottom:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#1a1f36;">Have Questions? Ask Pattie.</p>
              <p style="margin:0 0 20px 0;font-size:14px;color:#6b7280;line-height:1.5;">
                Pattie is your AI patent assistant &mdash; she knows your patent inside and out and is available 24/7.
              </p>
              <a href="${patentUrl}"
                 style="display:inline-block;background-color:#1a1f36;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:0.2px;">
                Ask Pattie Now &rarr;
              </a>
            </td>
          </tr>

          <!-- ── Footer ─────────────────────────────────────────────────── -->
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                <a href="${appUrl}" style="color:#6366f1;text-decoration:none;font-weight:600;">PatentPending</a> &middot; patentpending.app<br>
                You&rsquo;re receiving this because you filed a patent with PatentPending.<br>
                Questions? Reply to this email or contact <a href="mailto:support@hotdeck.com" style="color:#6366f1;">support@hotdeck.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#6b7280;font-weight:600;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:#1a1f36;font-weight:700;">${value}</td>
  </tr>`
}

function checkItem(text: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
    <tr>
      <td style="width:24px;vertical-align:top;padding-top:1px;">
        <span style="display:inline-block;width:18px;height:18px;background-color:#dcfce7;border-radius:50%;text-align:center;font-size:11px;line-height:18px;color:#16a34a;font-weight:800;">✓</span>
      </td>
      <td style="font-size:14px;color:#374151;line-height:1.5;padding-left:8px;">${text}</td>
    </tr>
  </table>`
}

function nextItem(icon: string, title: string, desc: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
    <tr>
      <td style="width:36px;vertical-align:top;font-size:20px;padding-top:2px;">${icon}</td>
      <td style="padding-left:10px;vertical-align:top;">
        <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#1a1f36;">${title}</p>
        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">${desc}</p>
      </td>
    </tr>
  </table>`
}
