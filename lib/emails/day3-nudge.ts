export function day3NudgeEmail(firstName: string, appUrl = 'https://patentpending.app') {
  return {
    subject: `Still thinking about your invention, ${firstName}?`,
    from: 'Pattie <pattie@patentpending.app>',
    html: `
<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1f36;">
  <h2>Hey ${firstName} — just a nudge.</h2>
  <p>You signed up 3 days ago but haven't added your invention yet.</p>
  <p>Most inventors spend weeks "thinking about it" while the 12-month disclosure window quietly closes.</p>
  <p>It takes 10 minutes to get started. I do the heavy lifting.</p>
  <div style="margin: 24px 0;">
    <a href="${appUrl}/dashboard/patents/new" style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
      Pick up where you left off →
    </a>
  </div>
  <p style="color: #94a3b8; font-size: 12px;">– Pattie @ patentpending.app</p>
</div>`,
    text: `Hey ${firstName} — still thinking about your invention? It only takes 10 min: ${appUrl}/dashboard/patents/new`,
  }
}
