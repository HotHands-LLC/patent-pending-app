import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { promises as dns } from 'dns'

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

const CNAME_TARGET = 'partners.patentpending.app'

/**
 * POST /api/partner/verify-domain
 * Body: { domain?: string }  — if provided, saves it first
 * Performs DNS CNAME lookup and marks verified if correct.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const submittedDomain: string | undefined = body.domain?.toLowerCase().trim()

  // Get partner profile
  const { data: pp } = await supabaseService
    .from('partner_profiles')
    .select('id, slug, custom_domain, custom_domain_verified')
    .eq('user_id', user.id)
    .single()

  if (!pp) return NextResponse.json({ error: 'Partner profile not found' }, { status: 404 })

  // If domain submitted, save it
  if (submittedDomain) {
    // Validate format
    if (!/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/.test(submittedDomain)) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
    }
    await supabaseService
      .from('partner_profiles')
      .update({
        custom_domain: submittedDomain,
        custom_domain_verified: false,
        custom_domain_verified_at: null,
        custom_domain_cname_target: CNAME_TARGET,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pp.id)
    pp.custom_domain = submittedDomain
    pp.custom_domain_verified = false
  }

  const domain = pp.custom_domain
  if (!domain) return NextResponse.json({ error: 'No domain set' }, { status: 400 })

  // DNS CNAME lookup
  let cnameResult: string | null = null
  try {
    const records = await dns.resolveCname(domain)
    cnameResult = records?.[0]?.toLowerCase().replace(/\.$/, '') ?? null
  } catch {
    // DNS resolution failed — not propagated or wrong record type
  }

  const verified = cnameResult === CNAME_TARGET || cnameResult?.endsWith(`.${CNAME_TARGET}`) === true

  if (verified) {
    await supabaseService
      .from('partner_profiles')
      .update({
        custom_domain_verified: true,
        custom_domain_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pp.id)
  }

  return NextResponse.json({
    ok:            true,
    domain,
    verified,
    cname_found:   cnameResult,
    cname_target:  CNAME_TARGET,
    message:       verified
      ? `✅ Domain verified — your profile is live at ${domain}`
      : cnameResult
        ? `CNAME found (${cnameResult}) but doesn't match ${CNAME_TARGET}. Check your DNS record.`
        : `DNS not yet propagated. Add the CNAME record and check again in a few minutes.`,
  })
}

/**
 * PATCH /api/partner/verify-domain
 * Save/update custom domain without verifying (for the "set domain" step).
 */
export async function PATCH(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { domain } = await req.json().catch(() => ({}))
  if (!domain || typeof domain !== 'string') return NextResponse.json({ error: 'domain required' }, { status: 400 })

  const clean = domain.toLowerCase().trim()
  if (!/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/.test(clean)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
  }

  const { data: pp } = await supabaseService
    .from('partner_profiles').select('id').eq('user_id', user.id).single()
  if (!pp) return NextResponse.json({ error: 'Partner profile not found' }, { status: 404 })

  await supabaseService.from('partner_profiles').update({
    custom_domain: clean,
    custom_domain_verified: false,
    custom_domain_verified_at: null,
    custom_domain_cname_target: CNAME_TARGET,
    updated_at: new Date().toISOString(),
  }).eq('id', pp.id)

  return NextResponse.json({ ok: true, domain: clean, cname_target: CNAME_TARGET })
}
