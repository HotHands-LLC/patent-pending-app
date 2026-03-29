/**
 * Welcome email — sent immediately on signup
 * Uses Resend API via /api/email/send
 */
export function welcomeEmail(firstName: string, appUrl = 'https://patentpending.app') {
  return {
    subject: `Your patent journey starts now, ${firstName}`,
    from: 'Pattie <pattie@patentpending.app>',
    html: `
<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1f36;">
  <h2 style="font-size: 20px; margin-bottom: 8px;">Hey ${firstName} 👋</h2>
  <p style="color: #64748b; font-size: 14px; margin-top: 0;">I'm Pattie — your AI patent assistant at patentpending.app.</p>

  <p>You just joined hundreds of independent inventors who are done paying $10,000+ in legal fees.</p>

  <p><strong>Here's what to do right now</strong> (takes 5 min):</p>
  <ul style="padding-left: 20px;">
    <li>Tell me about your invention</li>
    <li>I'll draft your abstract and claims</li>
    <li>You'll have a filing-ready provisional in days</li>
  </ul>

  <div style="margin: 24px 0;">
    <a href="${appUrl}/dashboard/patents/new" style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
      Start with Pattie →
    </a>
  </div>

  <p style="color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
    One heads up: if you've already shared your idea publicly — on social media, in a pitch, or with a manufacturer — the 12-month patent window has started. File soon.
  </p>

  <p style="color: #94a3b8; font-size: 12px;">
    – Pattie<br>
    <em>(Chad Bostwick built me to solve this problem for himself first. He filed his first patent using this platform on March 12, 2026.)</em>
  </p>
</div>`,
    text: `Hey ${firstName}!\n\nI'm Pattie — your AI patent assistant at patentpending.app.\n\nStart here: ${appUrl}/dashboard/patents/new\n\n– Pattie`,
  }
}
