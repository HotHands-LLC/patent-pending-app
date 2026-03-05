import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const INTAKE_ID = '173678b5-84cf-4314-af29-3bfc33c0ad8c'
  
  // Test 1: read intake
  const { data: readData, error: readErr } = await supabase
    .from('patent_intake_sessions')
    .select('id, payment_status')
    .eq('id', INTAKE_ID)
    .single()
  
  // Test 2: update intake
  const { data: updateData, error: updateErr } = await supabase
    .from('patent_intake_sessions')
    .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', INTAKE_ID)
    .select('id, payment_status')
    .single()
  
  // Test 3: check upsert options in v2
  const { data: upsertData, error: upsertErr } = await supabase
    .from('patent_profiles')
    .upsert(
      { id: '8c11a80b-2a67-4e52-a151-a524ffca145e', email: 'support@hotdeck.com', full_name: 'Chad Bostwick' },
      { onConflict: 'id' }
    )
    .select('id')
    .single()

  return NextResponse.json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 20),
    has_srk: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    read: { data: readData, error: readErr?.message },
    update: { data: updateData, error: updateErr?.message },
    upsert: { data: upsertData, error: upsertErr?.message },
  })
}
