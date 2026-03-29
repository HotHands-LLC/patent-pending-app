export function deadlineWarningEmail(opts: { firstName: string; patentTitle: string; deadlineDate: string; daysLeft: number; appUrl?: string }) {
  const { firstName, patentTitle, deadlineDate, daysLeft, appUrl = 'https://patentpending.app' } = opts
  return {
    subject: `⚠️ ${patentTitle}: ${daysLeft} days until your filing deadline`,
    from: 'Pattie <pattie@patentpending.app>',
    html: `
<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1f36;">
  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <strong style="color: #dc2626;">⚠️ ${daysLeft} days remaining</strong>
  </div>
  <h2>Hey ${firstName},</h2>
  <p>Your provisional application for <strong>"${patentTitle}"</strong> expires in ${daysLeft} days (${deadlineDate}).</p>
  <p>If you want patent protection, you need to file the non-provisional before this date. After that, your provisional is abandoned and the invention enters the public domain.</p>
  <p><strong>What to do now:</strong></p>
  <ul>
    <li>Review your claims draft in patentpending.app</li>
    <li>File at patentcenter.uspto.gov (~$320 micro entity)</li>
    <li>Or ask Pattie to help you prepare the filing package</li>
  </ul>
  <div style="margin: 24px 0;">
    <a href="${appUrl}/dashboard" style="background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
      View Filing Checklist →
    </a>
  </div>
  <p style="color: #94a3b8; font-size: 12px;">– Pattie @ patentpending.app</p>
</div>`,
    text: `Hey ${firstName} — ${patentTitle} deadline is in ${daysLeft} days (${deadlineDate}). File now: ${appUrl}/dashboard`,
  }
}
