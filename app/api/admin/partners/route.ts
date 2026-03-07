import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseService.from('patent_profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

/** GET /api/admin/partners — list all applications */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined

  let query = supabaseService
    .from('patent_counsel_partners')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ partners: data ?? [] })
}

/** PATCH /api/admin/partners — approve/reject, extend pro */
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, action, notes } = body // action: 'approve' | 'reject' | 'extend_pro'

  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

  let update: Record<string, unknown> = { notes }

  if (action === 'approve') {
    // Extend Pro by 12 months on approval
    const proExpiry = new Date()
    proExpiry.setFullYear(proExpiry.getFullYear() + 1)
    update = { status: 'approved', is_active: true, pro_expiry: proExpiry.toISOString(), notes }

    // Send approval email
    const { data: partner } = await supabaseService
      .from('patent_counsel_partners')
      .select('email, full_name, referral_code')
      .eq('id', id)
      .single()

    if (partner && process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'PatentPending <notifications@patentpending.app>',
          to: [partner.email],
          subject: 'Welcome to the PatentPending Counsel Partner Program',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<h2 style="color:#4f46e5">Welcome to PatentPending, ${partner.full_name}!</h2>
<p>Your application to the PatentPending Counsel Partner Program has been approved.</p>
<h3>Your Partner Details</h3>
<ul>
<li><strong>Referral Code:</strong> <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${partner.referral_code}</code></li>
<li><strong>Pro Access:</strong> 12 months free, extended by 1 month per client referral</li>
<li><strong>Directory:</strong> Your profile is now listed at <a href="https://patentpending.app/find-counsel">patentpending.app/find-counsel</a></li>
</ul>
<h3>How It Works</h3>
<p>Share your referral link with prospective clients:<br>
<code>https://patentpending.app/?ref=${partner.referral_code}</code></p>
<p>Each new user who signs up through your link extends your Pro account by 1 month.</p>
<p><a href="https://patentpending.app/login" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Access Your Account →</a></p>
</div>`,
        }),
      })
    }
  } else if (action === 'reject') {
    update = { status: 'rejected', is_active: false, notes }
  } else if (action === 'extend_pro') {
    const { data: current } = await supabaseService
      .from('patent_counsel_partners').select('pro_expiry').eq('id', id).single()
    const base = current?.pro_expiry ? new Date(current.pro_expiry) : new Date()
    if (base < new Date()) base.setTime(new Date().getTime())
    base.setMonth(base.getMonth() + 1)
    update = { pro_expiry: base.toISOString() }
  }

  const { data, error } = await supabaseService
    .from('patent_counsel_partners')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, partner: data })
}
