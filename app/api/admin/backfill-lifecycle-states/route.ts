/**
 * POST /api/admin/backfill-lifecycle-states
 *
 * Admin-only endpoint. Backfills the lifecycle_state column for all patents
 * based on existing status/filing data.
 *
 * Logic:
 *   status = 'granted'                                           → GRANTED
 *   status = 'non_provisional' (filed)                          → FILED_NONPROVISIONAL
 *   status = 'provisional' AND filing_date is not null          → PROVISIONAL_ACTIVE
 *   status = 'provisional' AND filing_date is null              → FILED_PROVISIONAL (just submitted)
 *   claims_draft + abstract_draft + title all present           → READY_TO_FILE
 *   otherwise                                                    → DRAFT
 *
 * DO NOT run automatically. Chad triggers this manually via POST.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PatentLifecycleState } from '@/lib/patent-lifecycle'

// Admin check — matches the pattern used by other admin endpoints
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return false

  // Also accept CRON_SECRET for programmatic access
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await svc.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin === true
}

type PatentRow = {
  id: string
  status: string | null
  filing_date: string | null
  claims_draft: string | null
  abstract_draft: string | null
  title: string | null
  filing_status: string | null
}

function inferLifecycleState(p: PatentRow): PatentLifecycleState {
  // Granted
  if (p.status === 'granted') return 'GRANTED'

  // Filed non-provisional
  if (p.status === 'non_provisional') return 'FILED_NONPROVISIONAL'

  // Provisional with filing confirmed
  if (p.status === 'provisional' && p.filing_date) return 'PROVISIONAL_ACTIVE'

  // Provisional submitted but not yet confirmed (provisional_filed filing_status)
  if (p.status === 'provisional' && !p.filing_date) return 'FILED_PROVISIONAL'

  // Abandoned
  if (p.status === 'abandoned') return 'ABANDONED'

  // Draft complete enough to file
  if (
    p.claims_draft && p.claims_draft.trim() !== '' &&
    p.abstract_draft && p.abstract_draft.trim() !== '' &&
    p.title && p.title.trim() !== ''
  ) return 'READY_TO_FILE'

  // Default
  return 'DRAFT'
}

export async function POST(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create Supabase client inside handler — no module-level client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch all patents with the columns we need
  const { data: patents, error: fetchError } = await supabase
    .from('patents')
    .select('id, status, filing_date, claims_draft, abstract_draft, title, filing_status')

  if (fetchError || !patents) {
    return NextResponse.json({ error: fetchError?.message ?? 'Failed to fetch patents' }, { status: 500 })
  }

  const breakdown: Partial<Record<PatentLifecycleState, number>> = {}
  let updated = 0
  const errors: string[] = []

  for (const patent of patents as PatentRow[]) {
    const state = inferLifecycleState(patent)
    breakdown[state] = (breakdown[state] ?? 0) + 1

    const { error: updateError } = await supabase
      .from('patents')
      .update({ lifecycle_state: state })
      .eq('id', patent.id)

    if (updateError) {
      errors.push(`${patent.id}: ${updateError.message}`)
    } else {
      updated++
    }
  }

  return NextResponse.json({
    updated,
    total: patents.length,
    breakdown,
    errors: errors.length > 0 ? errors : undefined,
  })
}
