import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/invite/peek?token=xxx
 * Public — no auth required. Returns enough info to render the invite landing page.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: collab } = await supabaseService
    .from('patent_collaborators')
    .select('id, patent_id, invited_email, role, accepted_at, created_at')
    .eq('invite_token', token)
    .single()

  if (!collab) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })
  if (collab.accepted_at) return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 })

  // Soft expiry check — 24 hours from created_at
  const EXPIRY_MS = 24 * 60 * 60 * 1000
  const createdAt = new Date(collab.created_at).getTime()
  if (Date.now() - createdAt > EXPIRY_MS) {
    return NextResponse.json({ error: 'expired', expired: true }, { status: 410 })
  }

  const { data: patent } = await supabaseService
    .from('patents')
    .select('title, owner_id')
    .eq('id', collab.patent_id)
    .single()

  // Fetch owner name/email for expiry UX
  let ownerName = 'the patent owner'
  let ownerEmail: string | null = null
  if (patent?.owner_id) {
    const { data: ownerProfile } = await supabaseService
      .from('patent_profiles')
      .select('full_name, email')
      .eq('id', patent.owner_id)
      .single()
    ownerName = ownerProfile?.full_name ?? ownerProfile?.email ?? 'the patent owner'
    ownerEmail = ownerProfile?.email ?? null
  }

  const roleLabel: Record<string, string> = {
    co_inventor: 'Co-Inventor',
    counsel: 'Legal Counsel',
    attorney: 'Attorney',
    viewer: 'Viewer',
  }

  return NextResponse.json({
    patent_title: patent?.title ?? 'a patent',
    invited_email: collab.invited_email,
    role: collab.role,
    role_label: roleLabel[collab.role] ?? collab.role,
    owner_name: ownerName,
    owner_email: ownerEmail,
    expires_at: new Date(new Date(collab.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  })
}
