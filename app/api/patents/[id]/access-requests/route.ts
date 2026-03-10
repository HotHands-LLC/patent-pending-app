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

/**
 * GET /api/patents/[id]/access-requests
 * Owner-only. Returns pending access requests with requester profile data.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id')
    .eq('id', patentId)
    .single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: requests } = await supabaseService
    .from('patent_access_requests')
    .select('id, requester_id, requested_role, message, status, created_at')
    .eq('patent_id', patentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!requests?.length) return NextResponse.json({ requests: [] })

  // Enrich with requester name / email
  const enriched = await Promise.all(
    requests.map(async (r) => {
      let requester_name: string | null = null
      let requester_email: string | null = null
      if (r.requester_id) {
        const { data: profile } = await supabaseService
          .from('patent_profiles')
          .select('full_name, email')
          .eq('id', r.requester_id)
          .single()
        requester_name = profile?.full_name ?? null
        requester_email = profile?.email ?? null
        if (!requester_email) {
          const authUser = await supabaseService.auth.admin.getUserById(r.requester_id)
          requester_email = authUser.data.user?.email ?? null
        }
      }
      return { ...r, requester_name, requester_email }
    })
  )

  return NextResponse.json({ requests: enriched })
}
