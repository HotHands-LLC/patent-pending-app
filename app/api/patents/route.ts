import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, sendEmail } from '@/lib/email'
import { getUserTierInfo, getPatentLimit, countUserPatents, patentLimitResponse } from '@/lib/tier'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'

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

/** Loose name match: any token from userFullName found in any inventor string */
function fuzzyNameMatch(userFullName: string, inventors: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').trim()
  const userTokens = norm(userFullName).split(/\s+/).filter(t => t.length > 1)
  return inventors.some(inv => {
    const invNorm = norm(inv)
    return userTokens.some(token => invNorm.includes(token))
  })
}

/**
 * POST /api/patents
 * Creates a new patent record with:
 * - Duplicate detection (same patent_number → same user redirect; different user → access request)
 * - Ownership verification for granted patents (fuzzy name match against inventors)
 * - Deadline creation for provisionals
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await getUserClient(token).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    title, description, inventors, provisional_number, application_number,
    patent_number, filing_date, provisional_deadline, status: patentStatus, tags,
    access_message,
  } = body as Record<string, unknown>

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // ── Patent count gate ───────────────────────────────────────────────────
  const tierInfo = await getUserTierInfo(user.id)
  const limit = getPatentLimit(tierInfo)
  const currentCount = await countUserPatents(user.id)
  if (currentCount >= limit) {
    return patentLimitResponse(currentCount, limit)
  }

  // ── 1. Duplicate detection ──────────────────────────────────────────────
  if (patent_number && typeof patent_number === 'string' && patent_number.trim()) {
    const { data: existing } = await supabaseService
      .from('patents')
      .select('id, owner_id, title')
      .eq('patent_number', patent_number.trim())
      .maybeSingle()

    if (existing) {
      if (existing.owner_id === user.id) {
        // Same user already owns this record — redirect
        return NextResponse.json({ duplicate: true, patent_id: existing.id })
      }

      // Different user — create access request (if not already pending)
      const { data: existingRequest } = await supabaseService
        .from('patent_access_requests')
        .select('id, status')
        .eq('patent_id', existing.id)
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .maybeSingle()

      if (!existingRequest) {
        await supabaseService.from('patent_access_requests').insert({
          patent_id: existing.id,
          requester_id: user.id,
          requested_role: 'viewer',
          message: typeof access_message === 'string' ? access_message : null,
        })
      }

      // Notify the patent owner
      try {
        const ownerAuth = await supabaseService.auth.admin.getUserById(existing.owner_id)
        const ownerEmail = ownerAuth.data.user?.email
        if (ownerEmail) {
          const { data: requesterProfile } = await supabaseService
            .from('patent_profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
          const requesterName = requesterProfile?.full_name || user.email || 'Someone'
          const patentUrl = `${APP_URL}/dashboard/patents/${existing.id}?tab=collaborators`
          await sendEmail(buildEmail({
            to: ownerEmail,
            subject: `Access request: "${existing.title}"`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#4f46e5">Access request received</h2>
  <p><strong>${requesterName}</strong> has requested <strong>Viewer</strong> access to your patent:</p>
  <p style="font-size:1.1em;font-weight:bold;color:#1a1f36">"${existing.title}"</p>
  ${typeof access_message === 'string' && access_message ? `<p>Their message: <em>${access_message}</em></p>` : ''}
  <p>Review and approve or deny from your Collaborators tab:</p>
  <p><a href="${patentUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Review Request →</a></p>
</div>`,
          }))
        }
      } catch { /* non-fatal — email failure should not block response */ }

      return NextResponse.json({
        access_requested: true,
        patent_title: existing.title,
      })
    }
  }

  // ── 2. Ownership verification for granted patents ───────────────────────
  let ownership_verified = false
  const inventorList = Array.isArray(inventors) ? (inventors as string[]) : []

  if (patentStatus === 'granted' && inventorList.length > 0) {
    try {
      const { data: profile } = await supabaseService
        .from('patent_profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      if (profile?.full_name) {
        ownership_verified = fuzzyNameMatch(profile.full_name, inventorList)
      }
    } catch { /* fail open */ }
  }

  // ── 3. Insert patent ────────────────────────────────────────────────────
  const { data: patent, error } = await supabaseService
    .from('patents')
    .insert({
      owner_id: user.id,
      title: title.trim(),
      description: description || null,
      inventors: inventorList,
      provisional_number: provisional_number || null,
      application_number: application_number || null,
      patent_number: patent_number ? String(patent_number).trim() : null,
      filing_date: filing_date || null,
      provisional_deadline: provisional_deadline || null,
      status: patentStatus || 'provisional',
      tags: Array.isArray(tags) ? tags : [],
      ownership_verified,
    })
    .select()
    .single()

  if (error || !patent) {
    // Unique constraint violation (race condition)
    if (error?.code === '23505') {
      return NextResponse.json({
        error: 'A patent with this number already exists.',
        code: 'duplicate_patent_number',
      }, { status: 409 })
    }
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  // ── 4. Create deadline for provisional ─────────────────────────────────
  if (provisional_deadline && patentStatus === 'provisional') {
    await supabaseService.from('patent_deadlines').insert({
      patent_id: patent.id,
      owner_id: user.id,
      deadline_type: 'non_provisional',
      due_date: provisional_deadline,
      notes: 'File non-provisional or PCT by this date (12 months from provisional)',
    })
  }

  return NextResponse.json({ ...patent, ownership_verified }, { status: 201 })
}
