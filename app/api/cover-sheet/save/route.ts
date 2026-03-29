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

/**
 * POST /api/cover-sheet/save
 * Persists cover sheet edits back to patent_profiles + user_contacts.
 * Body:
 *   patent_id          string
 *   save_to_profile    boolean — if false, skip DB writes
 *   inventor: { name_first, name_middle, name_last, address_line_1, address_line_2,
 *               city, state, zip, country, phone, email }
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await getUserClient(auth.slice(7)).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    patent_id: string
    save_to_profile: boolean
    inventor: {
      name_first: string; name_middle?: string; name_last: string
      address_line_1?: string; address_line_2?: string
      city?: string; state?: string; zip?: string; country?: string
      phone?: string; email?: string; uspto_customer_number?: string
    }
    assignee_name?:    string | null
    assignee_address?: string | null
  }

  if (!body.save_to_profile) {
    return NextResponse.json({ ok: true, saved: false, message: 'PDF generated without saving profile' })
  }

  const { inventor, patent_id } = body
  const now = new Date().toISOString()

  // 1. Update patent_profiles split name + contact fields
  const fullName = [inventor.name_first, inventor.name_middle, inventor.name_last]
    .filter(Boolean).join(' ')

  await supabaseService.from('patent_profiles').update({
    name_first:             inventor.name_first,
    name_middle:            inventor.name_middle ?? null,
    name_last:              inventor.name_last,
    full_name:              fullName,
    phone:                  inventor.phone ?? null,
    address_line_1:         inventor.address_line_1 ?? null,
    address_line_2:         inventor.address_line_2 ?? null,
    city:                   inventor.city ?? null,
    state:                  inventor.state ?? null,
    zip:                    inventor.zip ?? null,
    country:                inventor.country ?? 'US',
    ...(inventor.uspto_customer_number ? { uspto_customer_number: inventor.uspto_customer_number } : {}),
    // Save assignee as user's default (pre-fills next cover sheet)
    ...(body.assignee_name    !== undefined ? { default_assignee_name:    body.assignee_name    } : {}),
    ...(body.assignee_address !== undefined ? { default_assignee_address: body.assignee_address } : {}),
    updated_at:             now,
  }).eq('id', user.id)

  // 2. Upsert default inventor contact
  const { data: existingContact } = await supabaseService.from('user_contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('contact_type', 'inventor')
    .eq('is_default', true)
    .single()

  const contactData = {
    user_id:         user.id,
    contact_type:    'inventor' as const,
    is_default:      true,
    name_first:      inventor.name_first,
    name_middle:     inventor.name_middle ?? null,
    name_last:       inventor.name_last,
    address_line_1:  inventor.address_line_1 ?? null,
    address_line_2:  inventor.address_line_2 ?? null,
    city:            inventor.city ?? null,
    state:           inventor.state ?? null,
    zip:             inventor.zip ?? null,
    country:         inventor.country ?? 'US',
    phone:           inventor.phone ?? null,
    email:           inventor.email ?? null,
    updated_at:      now,
  }

  if (existingContact?.id) {
    await supabaseService.from('user_contacts').update(contactData).eq('id', existingContact.id)
  } else {
    const { data: newContact } = await supabaseService.from('user_contacts')
      .insert(contactData).select('id').single()
    // Link new contact back to profile
    if (newContact?.id) {
      await supabaseService.from('patent_profiles')
        .update({ inventor_contact_id: newContact.id }).eq('id', user.id)
    }
  }

  // 3. Log the triggering patent_id in patent cover_sheet_acknowledged
  if (patent_id) {
    await supabaseService.from('patents')
      .update({ cover_sheet_acknowledged: true, updated_at: now })
      .eq('id', patent_id)
      .eq('owner_id', user.id)
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    message: 'Profile updated with your cover sheet info',
  })
}
