export function reEngagementEmail(opts: { firstName: string; daysSinceActive: number; appUrl?: string }) {
  const { firstName, daysSinceActive, appUrl = 'https://patentpending.app' } = opts
  return {
    subject: `${firstName}, your invention is still waiting`,
    from: 'Pattie <pattie@patentpending.app>',
    html: `
<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1f36;">
  <h2>Hey ${firstName},</h2>
  <p>It's been ${daysSinceActive} days since you last visited patentpending.app.</p>
  <p>Your invention idea hasn't changed — but your patent window might be shrinking.</p>
  <p>Every day you wait is a day closer to someone else filing first, or your disclosure window closing.</p>
  <p>Pattie can draft your patent claims in under 10 minutes. No legal background needed.</p>
  <div style="margin: 24px 0;">
    <a href="${appUrl}/dashboard" style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
      Resume with Pattie →
    </a>
  </div>
  <p style="color: #94a3b8; font-size: 12px;">– Pattie @ patentpending.app<br>Unsubscribe at any time in your account settings.</p>
</div>`,
    text: `Hey ${firstName} — it's been ${daysSinceActive} days. Your invention is waiting: ${appUrl}/dashboard`,
  }
}
