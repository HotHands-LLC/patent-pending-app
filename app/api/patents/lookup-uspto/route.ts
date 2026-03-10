import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/patents/lookup-uspto?q=<number>
// Looks up a patent by number using:
//   1. Google Patents scrape for publication/grant numbers (US\d+[A-Z]\d*)
//   2. USPTO ODP API for application numbers (17/123,456 format)
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

  // ── Route by input format ───────────────────────────────────────────────
  // Publication / grant number: US11977694B2, US20210123456A1, etc.
  const pubMatch = q.replace(/[\s,]/g, '').match(/^(US\d+[A-Z]\d*)$/i)
  if (pubMatch) {
    const result = await lookupGooglePatents(pubMatch[1].toUpperCase())
    if (result) return NextResponse.json({ found: true, results: [result] })
    return NextResponse.json({
      found: false,
      message: 'Patent not found on Google Patents. You can enter details manually.',
    })
  }

  // Application number: 17/123,456 or bare digits
  const ODP_KEY = process.env.USPTO_ODP_API_KEY
  if (!ODP_KEY) return NextResponse.json({ error: 'USPTO API not configured' }, { status: 500 })

  const normalized = q.replace(/[\s,/]/g, '')
  const results: Record<string, unknown>[] = []

  // Strategy 1: Direct application number lookup
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

  // Strategy 2: Search by applicationNumberText
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

  // Strategy 3: Free-text search
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

// ── Google Patents scraper ───────────────────────────────────────────────────
async function lookupGooglePatents(pubNum: string): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://patents.google.com/patent/${pubNum}/en`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // Title
    const titleM = html.match(/<meta name="DC\.title"\s+content="([^"]+)"/)
    const title = titleM ? titleM[1].replace(/\s+/g, ' ').trim() : ''
    if (!title) return null

    // Inventors — filter out "Individual" / "Applicant"
    const invRaw = [...html.matchAll(/<meta name="DC\.contributor"\s+content="([^"]+)"/g)]
      .map(m => m[1].trim())
      .filter(n => n && !['individual', 'applicant', 'assignee'].includes(n.toLowerCase()))
    const inventors = [...new Set(invRaw)]

    // Filing date
    const filingM = html.match(/itemprop="filingDate"[^>]*>([^<]+)</)
    const filingDate = filingM ? filingM[1].trim() : null

    // Application number (strip country code if present)
    const appM = html.match(/itemprop="applicationNumber"[^>]*>\s*([^<\s]+)/)
    const rawAppNum = appM ? appM[1].trim() : null
    // US17/376,091 → 17/376,091
    const application_number = rawAppNum
      ? rawAppNum.replace(/^US/i, '').replace(/(\d{2})(\d{3})(\d{3})/, '$1/$2,$3')
      : null

    // Abstract — div.abstract class
    const absM = html.match(/class="abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    let abstract = ''
    if (absM) {
      abstract = absM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
    }

    // Status detection from publication number suffix
    // B1/B2 = granted, A1/A2 = published pre-grant
    const suffix = pubNum.match(/[A-Z]\d*$/)?.[0] ?? ''
    let status: 'granted' | 'published' | 'non_provisional' = 'non_provisional'
    if (/^B/i.test(suffix)) status = 'granted'
    else if (/^A/i.test(suffix)) status = 'published'

    return {
      query: pubNum,
      application_number: application_number ?? '',
      patent_number: pubNum,         // the publication/grant number user typed
      publication_number: pubNum,
      title,
      inventors,
      filing_date: filingDate,
      provisional_deadline: null,
      status,
      status_text: status === 'granted' ? 'Patent Granted' : status === 'published' ? 'Pre-Grant Publication' : 'Non-Provisional',
      abstract,
      source: 'google_patents',
    }
  } catch {
    return null
  }
}

// ── ODP normalizer ───────────────────────────────────────────────────────────
function normalizeODP(p: Record<string, unknown>, query: string) {
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

  const statusText = String(p.applicationStatusDescriptionText || '').toLowerCase()
  let status = 'provisional'
  if (statusText.includes('granted') || statusText.includes('issued')) status = 'granted'
  else if (statusText.includes('published')) status = 'published'
  else if (statusText.includes('abandoned')) status = 'abandoned'
  else if (statusText.includes('non-provisional') || statusText.includes('utility')) status = 'non_provisional'

  const filingDate = String(p.filingDate || p.applicationFilingDate || '').split('T')[0] || null

  let provisionalDeadline: string | null = null
  if (filingDate && status === 'provisional') {
    const d = new Date(filingDate + 'T00:00:00')
    d.setFullYear(d.getFullYear() + 1)
    provisionalDeadline = d.toISOString().split('T')[0]
  }

  return {
    query,
    application_number: String(p.applicationNumberText || ''),
    patent_number: String(p.patentNumber || ''),
    publication_number: null,
    title: String(p.inventionTitle || ''),
    inventors,
    filing_date: filingDate,
    provisional_deadline: provisionalDeadline,
    status,
    status_text: String(p.applicationStatusDescriptionText || ''),
    assignee: String(((p.applicantBag as Record<string, unknown[]>)?.applicant as Record<string, unknown>[])?.[0]?.organizationNameText || ''),
    abstract: String(p.abstractText || '').slice(0, 1200),
    source: 'uspto_odp',
  }
}
