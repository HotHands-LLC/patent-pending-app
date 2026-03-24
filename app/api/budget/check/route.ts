import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAiBudget } from '@/lib/ai-budget'

export const dynamic = 'force-dynamic'

/**
 * GET /api/budget/check
 * Returns the current user's AI budget status.
 * Always returns { allowed: true } — never blocks. Warning string at 80%+.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  const status = await checkAiBudget(serviceClient, user.id)

  return NextResponse.json({
    allowed:     !status.overBudget,
    warning:     status.overBudget ? 'Monthly AI budget exceeded' : null,
    percentUsed: status.percentUsed,
    budget:      status.budget,
    used:        status.used,
  })
}
