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

/**
 * PATCH /api/patents/[id]/collaborators/[collabId]
 * Body: { can_edit: boolean }
 * Owner-only. Toggles write access for a specific collaborator.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; collabId: string }> }
) {
  const { id: patentId, collabId } = await params

  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify patent ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id')
    .eq('id', patentId)
    .single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 })
  }

  const body = await req.json()
  if (typeof body.can_edit !== 'boolean') {
    return NextResponse.json({ error: 'can_edit (boolean) required' }, { status: 400 })
  }

  const { data, error } = await supabaseService
    .from('patent_collaborators')
    .update({ can_edit: body.can_edit, updated_at: new Date().toISOString() })
    .eq('id', collabId)
    .eq('patent_id', patentId)
    .select('id, can_edit')
    .single()

  if (error || !data) {
    console.error('[collabId/patch] error:', error?.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, can_edit: data.can_edit })
}
