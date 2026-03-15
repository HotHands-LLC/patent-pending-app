import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

const EXPIRY_MS = 24 * 60 * 60 * 1000

export interface PersonRow {
  email: string
  name: string | null
  account_status: 'active' | 'ghost' | 'no_account'
  user_id: string | null
  patents_owned: number
  is_internal: boolean
  collaborations: Array<{
    collab_id: string
    patent_id: string
    patent_title: string
    role: string
    collab_status: 'active' | 'ghost' | 'pending' | 'expired'
  }>
  joined: string | null
  last_seen: string | null
}

/**
 * GET /api/admin/people
 * Admin-only. Unified People view merging:
 * - auth.users (all signed up accounts)
 * - patent_profiles (full user data)
 * - patent_collaborators + patents (invited but possibly no account)
 *
 * Deduped and merged by email. Returns one row per unique person.
 */
export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin gate — use profiles table (has is_admin column)
  const { data: adminProfile } = await supabaseService
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!(adminProfile as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parallel fetch all three sources ─────────────────────────────────────
  const [
    authUsersResult,
    profilesResult,
    collabsResult,
    patentsResult,
  ] = await Promise.all([
    supabaseService.auth.admin.listUsers({ perPage: 1000 }),
    supabaseService.from('patent_profiles').select('id, email, full_name, created_at, is_internal'),
    supabaseService
      .from('patent_collaborators')
      .select('id, patent_id, invited_email, role, accepted_at, user_id, created_at, patents(id, title)')
      .order('created_at', { ascending: false }),
    supabaseService.from('patents').select('id, owner_id'),
  ])

  const authUsers = authUsersResult.data?.users ?? []
  const profiles = profilesResult.data ?? []
  const collabs = collabsResult.data ?? []
  const allPatents = patentsResult.data ?? []

  // Build lookup maps
  const authByEmail = new Map(authUsers.map(u => [u.email?.toLowerCase() ?? '', u]))
  const profileByEmail = new Map(profiles.map(p => [(p.email ?? '').toLowerCase(), p]))

  // Build internal email set for quick lookup
  const internalEmails = new Set(
    profiles.filter(p => p.is_internal).map(p => (p.email ?? '').toLowerCase())
  )

  // Count patents owned per user_id
  const patentsOwnedByUserId = new Map<string, number>()
  for (const p of allPatents) {
    if (p.owner_id) {
      patentsOwnedByUserId.set(p.owner_id, (patentsOwnedByUserId.get(p.owner_id) ?? 0) + 1)
    }
  }

  // Collect all unique emails across all sources
  const allEmails = new Set<string>()
  for (const u of authUsers) { if (u.email) allEmails.add(u.email.toLowerCase()) }
  for (const p of profiles) { if (p.email) allEmails.add(p.email.toLowerCase()) }
  for (const c of collabs) { if (c.invited_email) allEmails.add(c.invited_email.toLowerCase()) }

  // Build auth user map by id for collab ghost detection
  const authById = new Map(authUsers.map(u => [u.id, u]))

  // ── Merge into one row per email ─────────────────────────────────────────
  const people: PersonRow[] = []

  for (const email of allEmails) {
    // Skip internal accounts from the People list (they appear in Billing with a badge)
    if (internalEmails.has(email)) continue
    const authUser = authByEmail.get(email)
    const profile = profileByEmail.get(email)

    // Account status
    let account_status: 'active' | 'ghost' | 'no_account'
    if (authUser) {
      account_status = authUser.last_sign_in_at ? 'active' : 'ghost'
    } else {
      account_status = 'no_account'
    }

    const user_id = authUser?.id ?? null

    // Collaborations for this email
    const personCollabs = collabs.filter(c => c.invited_email?.toLowerCase() === email)
    const collaborations = personCollabs.map(c => {
      let collab_status: 'active' | 'ghost' | 'pending' | 'expired'
      if (c.accepted_at) {
        const collabAuthUser = c.user_id ? authById.get(c.user_id) : null
        collab_status = collabAuthUser?.last_sign_in_at ? 'active' : 'ghost'
      } else {
        const isExpired = Date.now() - new Date(c.created_at).getTime() > EXPIRY_MS
        collab_status = isExpired ? 'expired' : 'pending'
      }
      return {
        collab_id: c.id,
        patent_id: c.patent_id,
        patent_title: (c.patents as { id?: string; title?: string } | null)?.title ?? 'Unknown Patent',
        role: c.role,
        collab_status,
      }
    })

    // Patents owned
    const patents_owned = user_id ? (patentsOwnedByUserId.get(user_id) ?? 0) : 0

    // Joined: earliest timestamp across sources
    const candidates = [
      authUser?.created_at,
      profile?.created_at,
      ...personCollabs.map(c => c.created_at),
    ].filter(Boolean) as string[]
    const joined = candidates.length
      ? candidates.sort()[0]
      : null

    const last_seen = authUser?.last_sign_in_at ?? null

    people.push({
      email,
      name: profile?.full_name ?? null,
      account_status,
      user_id,
      patents_owned,
      is_internal: internalEmails.has(email),
      collaborations,
      joined,
      last_seen,
    })
  }

  // Sort by joined desc (most recent first)
  people.sort((a, b) => {
    if (!a.joined && !b.joined) return 0
    if (!a.joined) return 1
    if (!b.joined) return -1
    return new Date(b.joined).getTime() - new Date(a.joined).getTime()
  })

  return NextResponse.json({ people, total: people.length })
}
