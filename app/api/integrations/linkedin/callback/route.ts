import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect('/admin/integrations?error=no_code')
  const clientId = process.env.LINKEDIN_CLIENT_ID ?? ''
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET ?? ''
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'}/api/integrations/linkedin/callback`
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${clientId}&client_secret=${clientSecret}`,
  })
  if (!tokenRes.ok) return NextResponse.redirect('/admin/integrations?error=token_failed')
  const tokens = await tokenRes.json()
  // Get person URN
  const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  })
  const profile = profileRes.ok ? await profileRes.json() : {}
  const personUrn = profile.sub ? `urn:li:person:${profile.sub}` : ''
  await getSvc().from('integration_credentials').upsert({
    brand: 'pp.app', service: 'linkedin',
    credentials_jsonb: { access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null, person_urn: personUrn },
    is_active: true, connected_at: new Date().toISOString(),
    token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 5184000) * 1000).toISOString(),
  }, { onConflict: 'brand,service' })
  return NextResponse.redirect('/admin/integrations?connected=linkedin')
}
