import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

const EXPIRY_MS = 24 * 60 * 60 * 1000

/**
 * GET /api/admin/collabs
 * Admin-only. Returns all collaborator invites across all patents,
 * with ghost detection (accepted but last_sign_in_at = null).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify admin — use profiles table (has is_admin column, not patent_profiles)
  const { data: profile } = await supabaseService
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all collabs with patent title
  const { data: collabs } = await supabaseService
    .from('patent_collaborators')
    .select('id, patent_id, invited_email, role, ownership_pct, accepted_at, user_id, created_at, updated_at, patents(title)')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!collabs) return NextResponse.json({ collabs: [] })

  // Batch fetch auth users for ghost detection using admin API
  // We fetch all users (up to 1000) and build a map of id → last_sign_in_at
  const userIds = new Set(collabs.filter(c => c.user_id).map(c => c.user_id as string))
  let signInMap: Record<string, string | null | undefined> = {}
  if (userIds.size > 0) {
    const { data: authList } = await supabaseService.auth.admin.listUsers({ perPage: 1000 })
    if (authList?.users) {
      for (const u of authList.users) {
        if (userIds.has(u.id)) {
          signInMap[u.id] = u.last_sign_in_at ?? null
        }
      }
    }
  }

  const enriched = collabs.map(c => {
    const isExpired = !c.accepted_at && (Date.now() - new Date(c.created_at).getTime() > EXPIRY_MS)
    let statusKey: 'pending' | 'expired' | 'active' | 'ghost'

    if (c.accepted_at) {
      const hasSignedIn = c.user_id && signInMap[c.user_id] !== undefined && signInMap[c.user_id] !== null
      statusKey = hasSignedIn ? 'active' : 'ghost'
    } else {
      statusKey = isExpired ? 'expired' : 'pending'
    }

    return {
      id: c.id,
      patent_id: c.patent_id,
      patent_title: (c.patents as { title?: string } | null)?.title ?? 'Unknown Patent',
      invited_email: c.invited_email,
      role: c.role,
      ownership_pct: c.ownership_pct,
      accepted_at: c.accepted_at,
      created_at: c.created_at,
      status: statusKey,
    }
  })

  return NextResponse.json({ collabs: enriched })
}
