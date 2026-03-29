/**
 * POST /api/admin/features/certify-review
 * Runs Pattie's certification review for a feature.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const ADMIN_EMAILS = ['support@hotdeck.com', 'agent@hotdeck.com']

function getUser(t: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { global: { headers: { Authorization: `Bearer ${t}` } } }) }
function getSvc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '') }

export async function POST(req: NextRequest) {
  const t = req.headers.get('authorization')?.slice(7) ?? ''
  const { data: { user } } = await getUser(t).auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { feature_key } = await req.json()
  if (!feature_key) return NextResponse.json({ error: 'feature_key required' }, { status: 400 })

  const svc = getSvc()
  const { data: feature } = await svc.from('feature_catalog')
    .select('feature_key, feature_name, description, category, verification_checks, qa_passed')
    .eq('feature_key', feature_key).single()
  if (!feature) return NextResponse.json({ error: 'Feature not found' }, { status: 404 })

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const prompt = `You are the quality reviewer for Hot Hands IP LLC's software platform portfolio.

Review this feature for cross-brand deployment certification:

Feature: ${feature.feature_name}
Category: ${feature.category}
What it does: ${feature.description ?? 'No description'}
QA passed: ${feature.qa_passed ? 'Yes' : 'Not yet verified'}

Score on these dimensions (pass/fail + one sentence each):
1. Completeness — does the feature address its core purpose?
2. Security — credential exposure, auth bypass, or data leakage risks?
3. Brand-agnostic design — can it deploy to any brand without modification?
4. Data safety — no cross-brand data contamination?
5. Stability — known fragile points or edge cases?

Return JSON only: { "dimensions": [{"name":"completeness","result":"pass","note":"..."},...], "overall": "approved", "notes": "..." }`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1024, temperature: 0.2, responseMimeType: 'application/json' } }),
  })
  const d = await res.json()
  const review = JSON.parse(d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}')
  const approved = review.overall === 'approved'

  // Save review
  await svc.from('feature_catalog').update({
    pattie_review_result: review,
    pattie_reviewed_at: new Date().toISOString(),
  }).eq('feature_key', feature_key)

  await svc.from('certification_history').insert({
    feature_key, stage: 'pattie_review',
    result: approved ? 'approved' : 'rejected',
    notes: review.notes ?? '',
    performed_by: 'pattie',
  })

  return NextResponse.json({ review, approved })
}
