/**
 * GET /api/integrations/health?service=qbo|linkedin|reddit
 * Tests stored OAuth credentials by making a lightweight API call.
 * Admin-only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
}
function getSvc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}
async function checkAdmin(token: string) {
  const { data: { user } } = await getUserClient(token).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

async function testQBO(accessToken: string, realmId: string): Promise<{ ok: boolean; detail: string }> {
  if (!realmId) return { ok: false, detail: 'No realm ID stored — try reconnecting' }
  const res = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  )
  if (res.ok) return { ok: true, detail: 'QBO company info fetched successfully' }
  if (res.status === 401) return { ok: false, detail: 'Token expired — please reconnect QuickBooks' }
  return { ok: false, detail: `QBO returned HTTP ${res.status}` }
}

async function testLinkedIn(accessToken: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.ok) {
    const data = await res.json()
    return { ok: true, detail: `Authenticated as ${data.name ?? data.sub ?? 'LinkedIn user'}` }
  }
  if (res.status === 401) return { ok: false, detail: 'Token expired — please reconnect LinkedIn' }
  return { ok: false, detail: `LinkedIn returned HTTP ${res.status}` }
}

async function testFacebook(creds: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const pageToken = creds?.page_access_token
  const pageName = creds?.page_name
  if (!pageToken) return { ok: false, detail: 'No page_access_token stored — please reconnect Facebook' }
  // Validate token with Meta debug endpoint using app token
  const appId = process.env.FB_APP_ID ?? ''
  const appSecret = process.env.FB_APP_SECRET ?? ''
  const appToken = `${appId}|${appSecret}`
  const res = await fetch(
    `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(appToken)}`,
  )
  if (res.ok) {
    const data = await res.json()
    if (data.data?.is_valid) {
      return { ok: true, detail: `Connected as page: ${pageName ?? 'Facebook Page'} ✅` }
    }
    return { ok: false, detail: data.data?.error?.message ?? 'Token invalid — please reconnect' }
  }
  if (res.status === 401) return { ok: false, detail: 'Token expired — please reconnect Facebook' }
  return { ok: false, detail: `Facebook API returned HTTP ${res.status}` }
}

async function testReddit(accessToken: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'patentpending.app/1.0',
    },
  })
  if (res.ok) {
    const data = await res.json()
    return { ok: true, detail: `Authenticated as u/${data.name ?? 'reddit user'}` }
  }
  if (res.status === 401) return { ok: false, detail: 'Token expired — please reconnect Reddit' }
  return { ok: false, detail: `Reddit returned HTTP ${res.status}` }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const service = req.nextUrl.searchParams.get('service') ?? ''
  if (!['qbo', 'linkedin', 'reddit', 'facebook'].includes(service)) {
    return NextResponse.json({ error: 'service must be qbo, linkedin, reddit, or facebook' }, { status: 400 })
  }

  // Check env vars first
  const envCheck: Record<string, string[]> = {
    qbo: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET'],
    linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
    facebook: ['FB_APP_ID', 'FB_APP_SECRET'],
  }
  const missingEnv = (envCheck[service] ?? []).filter(k => !process.env[k])
  if (missingEnv.length > 0) {
    return NextResponse.json({
      ok: false,
      configured: false,
      detail: `Missing environment variables: ${missingEnv.join(', ')}. Set these in Vercel → Project Settings → Environment Variables.`,
    })
  }

  // Load stored credentials
  const { data: row } = await getSvc()
    .from('integration_credentials')
    .select('credentials_jsonb, is_active, realm_id')
    .eq('brand', 'pp.app')
    .eq('service', service)
    .maybeSingle()

  if (!row || !row.is_active) {
    return NextResponse.json({
      ok: false,
      configured: true,
      detail: `No active ${service.toUpperCase()} connection found. Use the Connect button to authorize.`,
    })
  }

  const creds = row.credentials_jsonb as Record<string, string>
  const accessToken = creds?.access_token ?? ''
  if (!accessToken) {
    return NextResponse.json({ ok: false, configured: true, detail: 'Stored credentials missing access_token — please reconnect' })
  }

  let result: { ok: boolean; detail: string }
  if (service === 'qbo') result = await testQBO(accessToken, row.realm_id ?? '')
  else if (service === 'linkedin') result = await testLinkedIn(accessToken)
  else if (service === 'facebook') result = await testFacebook(creds)
  else result = await testReddit(accessToken)

  return NextResponse.json({ ...result, configured: true })
}
