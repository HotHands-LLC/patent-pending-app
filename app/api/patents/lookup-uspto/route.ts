import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/patents/lookup-uspto?q=<number>
// Looks up a patent/application by number using USPTO ODP API.
// Auth required (bearer token). Returns normalized patent data.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })

  // Normalize: strip spaces, slashes, commas
  const normalized = q.replace(/[\s,/]/g, '')

  const ODP_KEY = process.env.USPTO_ODP_API_KEY
  if (!ODP_KEY) return NextResponse.json({ error: 'USPTO API not configured' }, { status: 500 })

  const results: Record<string, unknown>[] = []

  // ── Strategy 1: Direct application number lookup ──────────────────────────
  try {
    const directRes = await fetch(
      `https://api.uspto.gov/api/v1/patent/applications/${normalized}`,
      { headers: { 'X-API-KEY': ODP_KEY }, signal: AbortSignal.timeout(8000) }
    )
    if (directRes.ok) {
      const data = await directRes.json()
      const bag = data?.patentFileWrapperDataBag ?? []
      for (const item of bag) {
        const p = item?.patentFileWrapperData ?? {}
        if (p.inventionTitle || p.applicationNumberText) {
          results.push(normalizeODP(p, normalized))
        }
      }
    }
  } catch { /* timeout or not found */ }

  // ── Strategy 2: Search by application number text ─────────────────────────
  if (!results.length) {
    try {
      const searchRes = await fetch(
        `https://api.uspto.gov/api/v1/patent/applications/search?q=applicationNumberText:${normalized}&rows=3`,
        { headers: { 'X-API-KEY': ODP_KEY }, signal: AbortSignal.timeout(8000) }
      )
      if (searchRes.ok) {
        const data = await searchRes.json()
        const bag = data?.patentFileWrapperDataBag ?? []
        for (const item of bag) {
          const p = item?.patentFileWrapperData ?? {}
          if (p.inventionTitle) results.push(normalizeODP(p, normalized))
        }
      }
    } catch { /* timeout */ }
  }

  // ── Strategy 3: Search by full-text (title/keyword) ───────────────────────
  if (!results.length && q.length > 5 && isNaN(Number(normalized))) {
    try {
      const freeRes = await fetch(
        `https://api.uspto.gov/api/v1/patent/applications/search?q=${encodeURIComponent(q)}&rows=5`,
        { headers: { 'X-API-KEY': ODP_KEY }, signal: AbortSignal.timeout(8000) }
      )
      if (freeRes.ok) {
        const data = await freeRes.json()
        const bag = data?.patentFileWrapperDataBag ?? []
        for (const item of bag.slice(0, 3)) {
          const p = item?.patentFileWrapperData ?? {}
          if (p.inventionTitle) results.push(normalizeODP(p, q))
        }
      }
    } catch { /* timeout */ }
  }

  if (!results.length) {
    return NextResponse.json({
      found: false,
      message: 'No USPTO records found for this number. You can still enter details manually.',
    })
  }

  return NextResponse.json({ found: true, results })
}

function normalizeODP(p: Record<string, unknown>, query: string) {
  // Extract inventor names
  const invBag = (p.inventorBag as Record<string, unknown>)?.inventor
  const inventors: string[] = []
  if (Array.isArray(invBag)) {
    for (const inv of invBag) {
      const i = inv as Record<string, unknown>
      const name = [i.nameLineOneText, i.nameLineTwoText].filter(Boolean).join(' ')
        || [i.firstName, i.lastName].filter(Boolean).join(' ')
      if (name) inventors.push(String(name).trim())
    }
  } else if (invBag && typeof invBag === 'object') {
    const i = invBag as Record<string, unknown>
    const name = [i.nameLineOneText, i.nameLineTwoText].filter(Boolean).join(' ')
      || [i.firstName, i.lastName].filter(Boolean).join(' ')
    if (name) inventors.push(String(name).trim())
  }

  // Detect status
  const statusText = String(p.applicationStatusDescriptionText || '').toLowerCase()
  let status = 'provisional'
  if (statusText.includes('granted') || statusText.includes('issued')) status = 'granted'
  else if (statusText.includes('published')) status = 'published'
  else if (statusText.includes('abandoned')) status = 'abandoned'
  else if (statusText.includes('non-provisional') || statusText.includes('utility')) status = 'non_provisional'

  // Parse filing date
  const filingDate = String(p.filingDate || p.applicationFilingDate || '').split('T')[0] || null

  // Auto-calc provisional deadline (12 months from filing if provisional)
  let provisionalDeadline: string | null = null
  if (filingDate && status === 'provisional') {
    const d = new Date(filingDate + 'T00:00:00')
    d.setFullYear(d.getFullYear() + 1)
    provisionalDeadline = d.toISOString().split('T')[0]
  }

  return {
    query,
    application_number: String(p.applicationNumberText || ''),
    patent_number: String(p.patentNumber || p.grantDocumentMetaData || ''),
    title: String(p.inventionTitle || ''),
    inventors,
    filing_date: filingDate,
    provisional_deadline: provisionalDeadline,
    status,
    status_text: String(p.applicationStatusDescriptionText || ''),
    assignee: String(((p.applicantBag as Record<string, unknown[]>)?.applicant as Record<string, unknown>[])?.[0]?.organizationNameText || ''),
    abstract: String(p.abstractText || '').slice(0, 1000),
    source: 'uspto_odp',
  }
}
