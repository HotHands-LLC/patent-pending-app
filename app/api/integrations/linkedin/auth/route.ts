import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'LINKEDIN_CLIENT_ID not configured' }, { status: 500 })
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'}/api/integrations/linkedin/callback`
  const state = Math.random().toString(36).slice(2)
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'openid profile w_member_social')
  url.searchParams.set('state', state)
  return NextResponse.redirect(url.toString())
}
