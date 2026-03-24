import { NextRequest, NextResponse } from 'next/server'
import { getPermissionsMatrix } from '@/app/api/admin/role-permissions/route'

/**
 * GET /api/role-permissions?role=xxx
 * Public. Returns { [feature]: boolean } map for a single role.
 * Used by client components (patent detail page, Pattie FAB) to gate UI.
 * co_inventor always returns all-true.
 */
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get('role')
  if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 })

  if (role === 'co_inventor') {
    const allTrue: Record<string, boolean> = {}
    for (const f of ['details', 'claims', 'spec', 'correspondence', 'filing', 'collaborators', 'pattie', 'deadlines']) {
      allTrue[f] = true
    }
    return NextResponse.json({ permissions: allTrue })
  }

  const matrix = await getPermissionsMatrix()
  const rolePerms = matrix[role] ?? {}
  // Fill in missing features as false
  const permissions: Record<string, boolean> = {}
  for (const f of ['details', 'claims', 'spec', 'correspondence', 'filing', 'collaborators', 'pattie', 'deadlines']) {
    permissions[f] = rolePerms[f] ?? false
  }

  return NextResponse.json({ permissions })
}
