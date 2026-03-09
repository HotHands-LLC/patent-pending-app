import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/correspondence/download?path=ENCODED_STORAGE_PATH&corrId=CORR_ID
// Auth-gated: verifies user owns the correspondence record, then generates a
// fresh 1-hour signed URL and redirects the browser to it.
export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  // Also accept ?token= for <a> download links (no JS needed)
  const qToken = req.nextUrl.searchParams.get('token')
  const jwt = token ?? qToken
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storagePath = req.nextUrl.searchParams.get('path')
  if (!storagePath) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  // ── Verify path belongs to this user ────────────────────────────────────────
  // Storage paths are prefixed with {userId}/... so just check the prefix
  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: signed, error } = await serviceClient.storage
    .from('patent-uploads')
    .createSignedUrl(storagePath, 3600)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
