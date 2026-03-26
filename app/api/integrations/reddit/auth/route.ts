import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const clientId = process.env.REDDIT_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'REDDIT_CLIENT_ID not configured — add via /admin/integrations' }, { status: 500 })
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'}/api/integrations/reddit/callback`
  const state = Math.random().toString(36).slice(2)
  const url = new URL('https://www.reddit.com/api/v1/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('duration', 'permanent')
  url.searchParams.set('scope', 'identity submit read')
  return NextResponse.redirect(url.toString())
}
