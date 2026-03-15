import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAD_CHAT_ID ?? '6733341890'

async function getAdminUser(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const userClient = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

/**
 * POST /api/admin/telegram-alert
 * Sends a Telegram message to Chad's chat and marks inbox item as actioned.
 * Body: { message, inbox_item_id? }
 */
export async function POST(req: NextRequest) {
  const user = await getAdminUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { message, inbox_item_id } = body

  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (!TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    )
    const tgData = await tgRes.json()
    if (!tgData.ok) {
      return NextResponse.json({ error: `Telegram error: ${tgData.description}` }, { status: 500 })
    }

    // Mark inbox item as actioned
    if (inbox_item_id) {
      await supabaseService
        .from('inbox_items')
        .update({
          sent_to_telegram_at: new Date().toISOString(),
          actioned_at: new Date().toISOString(),
          is_reviewed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inbox_item_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
