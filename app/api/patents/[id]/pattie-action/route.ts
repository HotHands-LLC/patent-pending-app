// POST /api/patents/[id]/pattie-action
// Auth: requires CRON_SECRET in Authorization header (same as other cron endpoints)
// Body: { tool: PattieToolName, params: Record<string, unknown>, trigger_id: string }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { executePattieTools, PATTIE_TOOLS } from '@/lib/pattie-tools'
import type { PattieToolName } from '@/lib/pattie-tools'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: CRON_SECRET only
  const auth = req.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patentId } = await params

  const body = (await req.json().catch(() => ({}))) as {
    tool?: PattieToolName
    params?: Record<string, unknown>
    trigger_id?: string
  }

  if (!body.tool || !PATTIE_TOOLS.find((t) => t.name === body.tool)) {
    return NextResponse.json({ error: 'Invalid tool name' }, { status: 400 })
  }

  // Create service client inside handler — never at module level
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )

  // Verify patent exists and get owner
  const { data: patent } = await supabase
    .from('patents')
    .select('id, owner_id, title')
    .eq('id', patentId)
    .single()

  if (!patent) {
    return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  }

  const context = {
    patentId,
    userId: patent.owner_id,
    supabase,
  }

  const result = await executePattieTools(body.tool, body.params ?? {}, context)

  // Log to pattie_monitoring_log if trigger_id provided
  if (body.trigger_id) {
    await supabase.from('pattie_monitoring_log').insert({
      patent_id: patentId,
      trigger_id: body.trigger_id,
      action_taken: body.tool,
      result: result.success ? result.message : (result.error ?? 'error'),
    })
  }

  return NextResponse.json({ success: result.success, result })
}
