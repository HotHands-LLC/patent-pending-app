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
    .select('id, patent_id, invited_email, role, accepted_at')
    .eq('invite_token', token)
    .single()

  if (!collab) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  if (collab.accepted_at) return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 })

  const { data: patent } = await supabaseService
    .from('patents')
    .select('title')
    .eq('id', collab.patent_id)
    .single()

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
  })
}
