import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function appUrl() { return process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app' }

export async function GET(_req: NextRequest) {
  const appId = process.env.FB_APP_ID
  if (!appId) return NextResponse.json({ error: 'FB_APP_ID not configured' }, { status: 500 })

  const redirectUri = `${appUrl()}/api/integrations/facebook/callback`
  const state = Math.random().toString(36).slice(2)

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'pages_manage_posts,pages_read_engagement')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)

  return NextResponse.redirect(url.toString())
}
