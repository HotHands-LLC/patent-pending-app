/**
 * GET /api/admin/marketplace/leads
 * Admin-only: returns all marketplace leads joined with patent title + slug.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Admin gate ─────────────────────────────────────────────────────────────
  const { data: profile } = await supabaseService
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Fetch leads + patents ──────────────────────────────────────────────────
  const { data: leads, error } = await supabaseService
    .from('marketplace_leads')
    .select(`
      id, patent_id, full_name, email, company, phone,
      interest_type, why_statement, status,
      owner_notified_at, introduced_at, created_at,
      patents:patent_id ( title, marketplace_slug )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten joined patent data
  const flat = (leads ?? []).map((l: Record<string, unknown>) => {
    const patent = l.patents as { title: string; marketplace_slug: string | null } | null
    return {
      ...l,
      patents: undefined,
      patent_title: patent?.title ?? 'Unknown Patent',
      patent_slug: patent?.marketplace_slug ?? null,
    }
  })

  return NextResponse.json({ leads: flat })
}
