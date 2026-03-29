/**
 * POST /api/social/post
 * Unified social posting endpoint.
 *
 * Body: { platform: string; content: string; connection_id?: string }
 * Returns: { success: boolean; post_url?: string; platform: string; error?: string }
 *
 * Supported platforms: facebook, linkedin
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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )
}
async function checkAdmin(token: string) {
  const { data: { user } } = await getUserClient(token).auth.getUser()
  return user && ADMIN_EMAILS.includes(user.email ?? '') ? user : null
}

// ── Platform posters ───────────────────────────────────────────────────────────

async function postToFacebook(
  content: string,
  creds: Record<string, string | null | Record<string, string>[]>,
): Promise<{ success: boolean; post_url?: string; error?: string }> {
  const pageId = creds.page_id as string | null
  const pageToken = creds.page_access_token as string | null

  if (!pageId || !pageToken) {
    return { success: false, error: 'Facebook page not configured — no page_id or page_access_token stored' }
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, access_token: pageToken }),
    },
  )

  const data = await res.json()

  if (!res.ok || data.error) {
    return { success: false, error: data.error?.message ?? `Facebook API error ${res.status}` }
  }

  const postId = data.id as string // format: "pageId_postId"
  const [pid, sid] = postId.split('_')
  const post_url = `https://www.facebook.com/${pid}/posts/${sid}`
  return { success: true, post_url }
}

async function postToLinkedIn(
  content: string,
  creds: Record<string, string | null>,
): Promise<{ success: boolean; post_url?: string; error?: string }> {
  const accessToken = creds.access_token
  const personUrn = creds.person_urn

  if (!accessToken) {
    return { success: false, error: 'LinkedIn access_token not stored — please reconnect' }
  }

  const body = {
    author: personUrn ?? `urn:li:person:unknown`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { success: false, error: (err as { message?: string }).message ?? `LinkedIn API error ${res.status}` }
  }

  const result = await res.json()
  // LinkedIn returns the URN; build a best-effort URL
  const urnId = (result.id as string | undefined)?.split(':').pop()
  const post_url = urnId ? `https://www.linkedin.com/feed/update/${result.id}/` : undefined
  return { success: true, post_url }
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  if (!await checkAdmin(token)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  let body: { platform?: string; content?: string; connection_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { platform, content } = body
  if (!platform || !content) {
    return NextResponse.json({ error: 'platform and content are required' }, { status: 400 })
  }

  const supportedPlatforms = ['facebook', 'linkedin']
  if (!supportedPlatforms.includes(platform.toLowerCase())) {
    return NextResponse.json(
      { success: false, platform, error: `Platform "${platform}" is not yet supported for direct posting` },
      { status: 422 },
    )
  }

  // Load stored credentials from integration_credentials
  const { data: row } = await getSvc()
    .from('integration_credentials')
    .select('credentials_jsonb, is_active')
    .eq('brand', 'pp.app')
    .eq('service', platform.toLowerCase())
    .maybeSingle()

  if (!row || !row.is_active) {
    return NextResponse.json(
      { success: false, platform, error: `No active ${platform} connection. Connect it in Admin → Integrations first.` },
      { status: 422 },
    )
  }

  const creds = row.credentials_jsonb as Record<string, string | null | Record<string, string>[]>

  let result: { success: boolean; post_url?: string; error?: string }
  if (platform.toLowerCase() === 'facebook') {
    result = await postToFacebook(content, creds)
  } else {
    result = await postToLinkedIn(content, creds as Record<string, string | null>)
  }

  if (result.success) {
    // Best-effort: update last_post_at in platform_connections if table exists
    await getSvc()
      .from('platform_connections')
      .update({ last_post_at: new Date().toISOString() })
      .eq('brand', 'pp.app')
      .eq('platform', platform.toLowerCase())
      .then(() => {/* ignore errors */ })
  }

  return NextResponse.json({ ...result, platform })
}
