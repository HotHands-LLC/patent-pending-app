import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

/** GET /api/integrations/qbo/callback — handle QBO OAuth callback */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const realmId = req.nextUrl.searchParams.get('realmId') ?? ''
  if (!code) return NextResponse.redirect('/admin/integrations?error=no_code')

  const clientId = process.env.QBO_CLIENT_ID ?? ''
  const clientSecret = process.env.QBO_CLIENT_SECRET ?? ''
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'}/api/integrations/qbo/callback`

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect('/admin/integrations?error=token_exchange_failed')
  }

  const tokens = await tokenRes.json()
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  await getSvc().from('integration_credentials').upsert({
    brand: 'pp.app',
    service: 'qbo',
    credentials_jsonb: { access_token: tokens.access_token, refresh_token: tokens.refresh_token },
    realm_id: realmId,
    is_active: true,
    connected_at: new Date().toISOString(),
    token_expires_at: expiresAt,
  }, { onConflict: 'brand,service' })

  return NextResponse.redirect('/admin/integrations?connected=qbo')
}
