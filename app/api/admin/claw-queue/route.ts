import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await serviceClient.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin ? user : null
}

// GET — list all items
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await serviceClient
    .from('claw_prompt_queue')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — create new item
export async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { prompt_label, prompt_body, priority } = body
  if (!prompt_label?.trim()) {
    return NextResponse.json({ error: 'prompt_label required' }, { status: 400 })
  }

  const { data, error } = await serviceClient
    .from('claw_prompt_queue')
    .insert({
      prompt_label: prompt_label.trim(),
      prompt_body: prompt_body?.trim() ?? '',
      priority: priority ?? 10,
      created_by: 'chad',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
