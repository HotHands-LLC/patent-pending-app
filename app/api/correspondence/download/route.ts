import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/correspondence/download?path=ENCODED_STORAGE_PATH&token=JWT
// Auth-gated: verifies user owns the file, generates a fresh 1-hour signed URL,
// redirects browser to it.
//
// Ownership check logic:
//   1. Path starts with user.id/  → direct ownership (standard upload path)
//   2. Path starts with a UUID/   → treat prefix as patent_id; verify user owns
//      the patent (patents.owner_id = user.id) OR is a collaborator
//   This handles files BoClaw uploaded under patent_id prefix (e.g. correspondence/)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth   = req.headers.get('authorization')
  const token  = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  const qToken = req.nextUrl.searchParams.get('token')
  const jwt    = token ?? qToken
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storagePath = req.nextUrl.searchParams.get('path')
  if (!storagePath || storagePath === 'undefined' || storagePath === 'null') {
    return NextResponse.json({ error: 'Missing or invalid path' }, { status: 400 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Ownership check ──────────────────────────────────────────────────────────
  let authorized = false

  if (storagePath.startsWith(`${user.id}/`)) {
    // Standard path: {user_id}/...
    authorized = true
  } else if (UUID_RE.test(storagePath)) {
    // Path prefixed with a UUID that isn't the user's — treat as patent_id
    const pathPatentId = storagePath.split('/')[0]

    // Check owner
    const { data: patent } = await serviceClient
      .from('patents')
      .select('owner_id')
      .eq('id', pathPatentId)
      .single()

    if (patent?.owner_id === user.id) {
      authorized = true
    } else {
      // Check collaborator access
      const { data: collab } = await serviceClient
        .from('patent_collaborators')
        .select('id')
        .eq('patent_id', pathPatentId)
        .eq('user_id', user.id)
        .single()
      if (collab) authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Generate signed URL ──────────────────────────────────────────────────────
  const { data: signed, error } = await serviceClient.storage
    .from('patent-uploads')
    .createSignedUrl(storagePath, 3600)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
