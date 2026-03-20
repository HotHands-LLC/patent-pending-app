import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getUserClient(token: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

/**
 * GET /api/dashboard/partner/status
 * Returns { is_partner: boolean } for the authenticated user.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ is_partner: false })
  }

  const userClient = getUserClient(auth.slice(7))
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ is_partner: false })

  const { data } = await userClient
    .from('attorney_partners')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  return NextResponse.json({ is_partner: !!data })
}
