/**
 * POST /api/patents/[id]/advance-stage
 * Derives the correct lifecycle stage from patent fields and updates DB if changed.
 * Auth: owner only
 * Returns: { stage, changed }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deriveStage } from '@/lib/patent-stage'
import type { Patent } from '@/lib/supabase'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Fetch patent ──────────────────────────────────────────────────────────
  const { data: patent, error: fetchErr } = await supabaseService
    .from('patents')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !patent) {
    return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
  }

  // ── Owner check ───────────────────────────────────────────────────────────
  if (patent.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Derive stage ──────────────────────────────────────────────────────────
  const derivedStage = deriveStage(patent as Patent)
  const currentStage = patent.stage ?? null
  const changed = derivedStage !== currentStage

  if (changed) {
    const { error: updateErr } = await supabaseService
      .from('patents')
      .update({ stage: derivedStage, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateErr) {
      console.error('[advance-stage] update error:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    console.log(`[advance-stage] patent=${id} stage: ${currentStage} → ${derivedStage}`)
  }

  return NextResponse.json({ stage: derivedStage, changed })
}
