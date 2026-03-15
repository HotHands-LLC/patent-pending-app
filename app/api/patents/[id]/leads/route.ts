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

const VALID_STATUSES = ['new', 'reviewed', 'qualified', 'rejected', 'closed'] as const

/**
 * GET /api/patents/[id]/leads — owner-only, returns all inquiries
 * PATCH /api/patents/[id]/leads?inquiry_id=xxx — owner-only, updates status
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

  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id')
    .eq('id', patentId)
    .single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseService
    .from('deal_inquiries')
    .select('*')
    .eq('patent_id', patentId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inquiries: data ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patentId } = await params
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: patent } = await supabaseService
    .from('patents')
    .select('owner_id')
    .eq('id', patentId)
    .single()
  if (!patent || patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const inquiryId = req.nextUrl.searchParams.get('inquiry_id')
  if (!inquiryId) return NextResponse.json({ error: 'inquiry_id required' }, { status: 400 })

  const body = await req.json()
  const { status } = body
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabaseService
    .from('deal_inquiries')
    .update({ status })
    .eq('id', inquiryId)
    .eq('patent_id', patentId)
    .select('id, status')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}
