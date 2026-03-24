import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function userClient(jwt: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )
}

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null
}

// POST /api/review — authenticated user submits a revision request
// owner_id is derived from the verified Bearer token — never trusted from body
export async function POST(req: NextRequest) {
  // Auth: require valid Bearer token
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = userClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { patent_id, draft_type, title, content, version } = await req.json()
    if (!patent_id || !draft_type || !title || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const { data, error } = await supabaseService
      .from('review_queue')
      .insert({
        patent_id,
        owner_id: user.id,  // set from token — not request body
        draft_type,
        title,
        content,
        version: version ?? 1,
        status: 'pending',
        submitted_by: 'boclaw',
      })
      .select('id, status')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// GET /api/review?status=pending — Chad reads the queue
export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = userClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status')
  let query = supabase
    .from('review_queue')
    .select('*, patents(title)')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten nested patents.title → patent_title for component compatibility
  const flat = (data ?? []).map((row: Record<string, unknown> & { patents?: { title?: string } | null }) => {
    const { patents, ...rest } = row
    return { ...rest, patent_title: patents?.title ?? null }
  })
  return NextResponse.json(flat)
}
