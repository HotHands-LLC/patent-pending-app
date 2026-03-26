import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** GET /api/integrations/qbo/auth — redirect to QBO OAuth */
export async function GET(req: NextRequest) {
  const clientId = process.env.QBO_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'QBO_CLIENT_ID not configured' }, { status: 500 })

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'}/api/integrations/qbo/callback`
  const state = Math.random().toString(36).slice(2)
  const url = new URL('https://appcenter.intuit.com/connect/oauth2')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'com.intuit.quickbooks.accounting')
  url.searchParams.set('state', state)

  return NextResponse.redirect(url.toString())
}
