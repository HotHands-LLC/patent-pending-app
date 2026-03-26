/**
 * POST /api/marketing/post — Post content to a connected platform
 * Body: { platform, content, brand, idea_id }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUserClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } })
}
function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { platform, content, brand, idea_id } = await req.json()
  if (!platform || !content) return NextResponse.json({ error: 'platform + content required' }, { status: 400 })

  const svc = getServiceClient()
  const { data: cred } = await svc.from('platform_credentials')
    .select('credentials_jsonb').eq('brand', brand ?? 'pp.app').eq('platform', platform).eq('is_active', true).single()
  if (!cred) return NextResponse.json({ error: `No active credentials for ${platform}` }, { status: 400 })
  const creds = cred.credentials_jsonb as Record<string, string>

  let postResult: { url?: string; id?: string; error?: string } = {}

  try {
    if (platform === 'reddit') {
      postResult = await postToReddit(creds, content)
    } else if (platform === 'linkedin') {
      postResult = await postToLinkedIn(creds, content)
    } else {
      return NextResponse.json({ error: `Platform '${platform}' posting not yet implemented` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  if (postResult.error) return NextResponse.json({ error: postResult.error }, { status: 502 })

  // Update idea status + record post
  if (idea_id) {
    await svc.from('marketing_ideas').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', idea_id)
    // Log to social_post_log
    await svc.from('social_post_log').insert({
      brand: brand ?? 'pp.app', platform, post_type: 'post',
      post_url: postResult.url ?? null, marketing_idea_id: idea_id,
      posted_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {})
  }
  await svc.from('platform_credentials').update({
    last_post_at: new Date().toISOString(),
    
  }).eq('brand', brand ?? 'pp.app').eq('platform', platform)
  try { await svc.rpc('increment_post_count', { p_brand: brand ?? 'pp.app', p_platform: platform }) } catch { /* ignore */ }

  return NextResponse.json({ ok: true, url: postResult.url })
}

async function postToReddit(creds: Record<string, string>, content: string) {
  const { client_id, client_secret, username, password, subreddit } = creds
  if (!client_id || !client_secret || !username || !password) {
    return { error: 'Reddit credentials incomplete (need client_id, client_secret, username, password)' }
  }
  // Get OAuth token
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'patentpending.app/1.0',
    },
    body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) return { error: `Reddit auth failed: ${tokenData.error ?? 'unknown'}` }

  // Submit post
  const target = subreddit ?? 'u_' + username
  const lines = content.split('\n').filter(Boolean)
  const title = lines[0].slice(0, 300)
  const text  = lines.slice(1).join('\n') || content

  const postRes = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'patentpending.app/1.0',
    },
    body: `sr=${encodeURIComponent(target)}&kind=self&title=${encodeURIComponent(title)}&text=${encodeURIComponent(text)}`,
  })
  const postData = await postRes.json()
  const url = postData?.jquery?.find?.((j: unknown[]) => Array.isArray(j) && typeof j[3] === 'string' && j[3].includes('reddit.com'))?.[3]
  return { url: url ?? 'https://reddit.com', id: postData?.name }
}

async function postToLinkedIn(creds: Record<string, string>, content: string) {
  const { access_token, person_urn } = creds
  if (!access_token) return { error: 'LinkedIn access_token required' }
  const urn = person_urn ?? 'urn:li:person:me'
  const body = {
    author: urn,
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
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    return { error: `LinkedIn API error: ${err.slice(0, 200)}` }
  }
  const data = await res.json()
  return { url: `https://www.linkedin.com/feed/`, id: data.id }
}
