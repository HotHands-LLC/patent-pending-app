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

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return (profile as { is_admin?: boolean } | null)?.is_admin ? user.id : null
}

export const FEATURES = ['details', 'claims', 'spec', 'correspondence', 'filing', 'collaborators', 'pattie', 'deadlines'] as const
export const EDITABLE_ROLES = ['co_inventor', 'legal_counsel', 'agency', 'viewer'] as const

/** GET /api/admin/role-permissions — full matrix, admin only */
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data, error } = await supabaseService
    .from('role_permissions')
    .select('role, feature, enabled')
    .order('role')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Shape: { [role]: { [feature]: boolean } }
  const matrix: Record<string, Record<string, boolean>> = {}
  for (const row of data ?? []) {
    if (!matrix[row.role]) matrix[row.role] = {}
    matrix[row.role][row.feature] = row.enabled
  }
  return NextResponse.json({ matrix })
}

/** POST /api/admin/role-permissions — upsert full matrix, admin only */
export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const matrix: Record<string, Record<string, boolean>> = body.matrix ?? {}

  const rows: { role: string; feature: string; enabled: boolean }[] = []
  for (const role of EDITABLE_ROLES) {
    // co_inventor is always all-true — skip any attempt to disable
    for (const feature of FEATURES) {
      const enabled = role === 'co_inventor' ? true : !!(matrix[role]?.[feature] ?? false)
      rows.push({ role, feature, enabled })
    }
  }

  const { error } = await supabaseService
    .from('role_permissions')
    .upsert(rows, { onConflict: 'role,feature' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clear server-side cache so next check picks up new values
  clearPermissionsCache()

  return NextResponse.json({ ok: true, updated: rows.length })
}

// Simple in-process cache (refreshed on save, or 5min TTL on Vercel)
let _cache: Record<string, Record<string, boolean>> | null = null
let _cacheAt = 0

export function clearPermissionsCache() {
  _cache = null
  _cacheAt = 0
}

export async function getPermissionsMatrix(): Promise<Record<string, Record<string, boolean>>> {
  if (_cache && Date.now() - _cacheAt < 5 * 60 * 1000) return _cache
  const { data } = await supabaseService.from('role_permissions').select('role, feature, enabled')
  const matrix: Record<string, Record<string, boolean>> = {}
  for (const row of data ?? []) {
    if (!matrix[row.role]) matrix[row.role] = {}
    matrix[row.role][row.feature] = row.enabled
  }
  _cache = matrix
  _cacheAt = Date.now()
  return matrix
}

export async function canAccess(role: string, feature: string): Promise<boolean> {
  if (role === 'co_inventor') return true // always full access
  const matrix = await getPermissionsMatrix()
  return matrix[role]?.[feature] ?? false
}
