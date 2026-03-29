import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }
function appUrl() { return process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app' }

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/admin/integrations?error=no_code', appUrl()))

  const clientId = process.env.REDDIT_CLIENT_ID ?? ''
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? ''
  const redirectUri = `${appUrl()}/api/integrations/reddit/callback`

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'patentpending.app/1.0',
    },
    body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  })

  if (!tokenRes.ok) return NextResponse.redirect(new URL('/admin/integrations?error=token_failed', appUrl()))

  const tokens = await tokenRes.json()

  await getSvc().from('integration_credentials').upsert({
    brand: 'pp.app',
    service: 'reddit',
    credentials_jsonb: { access_token: tokens.access_token, refresh_token: tokens.refresh_token },
    is_active: true,
    connected_at: new Date().toISOString(),
    token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
  }, { onConflict: 'brand,service' })

  return NextResponse.redirect(new URL('/admin/integrations?connected=reddit', appUrl()))
}
