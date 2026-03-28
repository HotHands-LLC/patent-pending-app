import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )
}
function appUrl() { return process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app' }

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/admin/integrations?error=no_code', appUrl()))
  }

  const appId = process.env.FB_APP_ID ?? ''
  const appSecret = process.env.FB_APP_SECRET ?? ''
  const redirectUri = `${appUrl()}/api/integrations/facebook/callback`

  // Exchange code for short-lived user token
  const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
  tokenUrl.searchParams.set('client_id', appId)
  tokenUrl.searchParams.set('client_secret', appSecret)
  tokenUrl.searchParams.set('redirect_uri', redirectUri)
  tokenUrl.searchParams.set('code', code)

  const tokenRes = await fetch(tokenUrl.toString())
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/admin/integrations?error=token_failed', appUrl()))
  }
  const tokenData = await tokenRes.json()
  const shortLivedToken = tokenData.access_token as string

  // Exchange for long-lived user token (60 days)
  const longUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token')
  longUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longUrl.searchParams.set('client_id', appId)
  longUrl.searchParams.set('client_secret', appSecret)
  longUrl.searchParams.set('fb_exchange_token', shortLivedToken)

  const longRes = await fetch(longUrl.toString())
  const longData = longRes.ok ? await longRes.json() : null
  const userToken = longData?.access_token ?? shortLivedToken

  // Fetch managed pages to get the first page access token + page ID
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(userToken)}`,
  )
  const pagesData = pagesRes.ok ? await pagesRes.json() : { data: [] }
  const pages: Array<{ id: string; name: string; access_token: string }> = pagesData.data ?? []
  const firstPage = pages[0] ?? null

  // Store in integration_credentials (matching linkedin pattern)
  await getSvc().from('integration_credentials').upsert(
    {
      brand: 'pp.app',
      service: 'facebook',
      credentials_jsonb: {
        user_access_token: userToken,
        page_id: firstPage?.id ?? null,
        page_name: firstPage?.name ?? null,
        page_access_token: firstPage?.access_token ?? null,
        pages: pages.map(p => ({ id: p.id, name: p.name, access_token: p.access_token })),
      },
      is_active: true,
      connected_at: new Date().toISOString(),
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
    },
    { onConflict: 'brand,service' },
  )

  // Also store in platform_connections for Mission Control gating
  await getSvc().from('platform_connections').upsert(
    {
      brand: 'pp.app',
      platform: 'facebook',
      is_active: true,
      connected_at: new Date().toISOString(),
      metadata: { page_name: firstPage?.name ?? null, page_id: firstPage?.id ?? null },
    },
    { onConflict: 'brand,platform' },
  ).then(() => {/* best-effort — table may not exist yet */ })

  const successUrl = new URL('/admin/integrations?connected=facebook', appUrl())
  return NextResponse.redirect(successUrl.toString())
}
