import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { Metadata } from 'next'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PartnerPageData {
  slug:            string
  partner_code:    string
  firm_name:       string | null
  bio:             string | null
  practice_areas:  string[] | null
  bar_verified:    boolean
  bar_state:       string | null
  full_name:       string | null  // from counsel_partner join
  partner_email:   string | null
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getPartnerBySlug(slug: string): Promise<PartnerPageData | null> {
  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  const { data, error } = await supabase
    .from('partner_profiles')
    .select(`
      slug, partner_code, firm_name, bio, practice_areas, bar_verified, bar_state,
      counsel_partner:patent_counsel_partners!partner_profiles_counsel_partner_id_fkey (
        full_name, email
      )
    `)
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (error || !data) return null

  return {
    slug:           data.slug,
    partner_code:   data.partner_code,
    firm_name:      data.firm_name,
    bio:            data.bio,
    practice_areas: data.practice_areas,
    bar_verified:   data.bar_verified,
    bar_state:      data.bar_state,
    full_name:      (data.counsel_partner as any)?.[0]?.full_name ?? (data.counsel_partner as any)?.full_name ?? null,
    partner_email:  (data.counsel_partner as any)?.[0]?.email ?? (data.counsel_partner as any)?.email ?? null,
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const partner = await getPartnerBySlug(params.slug)
  if (!partner) return { title: 'Partner Not Found' }
  const name = partner.firm_name ?? partner.full_name ?? 'PatentPending Partner'
  return {
    title:       `${name} — PatentPending Partner`,
    description: partner.bio ?? `File your patent through ${name} on PatentPending.app`,
    openGraph: {
      title:       `${name} — PatentPending Partner`,
      description: partner.bio ?? `File your patent through ${name} on PatentPending.app`,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PartnerProfilePage({ params }: { params: { slug: string } }) {
  const partner = await getPartnerBySlug(params.slug)
  if (!partner) notFound()

  const signupUrl = `/signup?ref=${partner.partner_code}`
  const displayName = partner.firm_name ?? partner.full_name ?? 'Our Partner'

  const areaLabels: Record<string, string> = {
    trademark:   'Trademark',
    patent:      'Patent',
    ip:          'Intellectual Property',
    copyright:   'Copyright',
    litigation:  'IP Litigation',
    licensing:   'Licensing',
    startup:     'Startup / VC',
    business:    'Business Law',
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-[#1a1f36] text-lg">PatentPending</Link>
        <Link href="/login" className="text-sm text-gray-500 hover:text-gray-800">Sign in</Link>
      </nav>

      {/* Hero */}
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        {/* Avatar initials */}
        <div className="w-20 h-20 rounded-full bg-[#1a1f36] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-5">
          {(partner.firm_name ?? partner.full_name ?? '?').charAt(0).toUpperCase()}
        </div>

        <h1 className="text-2xl font-bold text-[#1a1f36] mb-1">{displayName}</h1>

        {partner.full_name && partner.firm_name && (
          <p className="text-gray-500 text-sm mb-3">{partner.full_name}</p>
        )}

        <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
          {partner.bar_verified && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              ✓ Bar Verified
              {partner.bar_state ? ` · ${partner.bar_state}` : ''}
            </span>
          )}
          {(partner.practice_areas ?? []).slice(0, 4).map(area => (
            <span key={area} className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
              {areaLabels[area.toLowerCase()] ?? area}
            </span>
          ))}
        </div>

        {partner.bio && (
          <p className="text-gray-600 text-base leading-relaxed max-w-lg mx-auto mb-6">{partner.bio}</p>
        )}
        {!partner.bio && (
          <p className="text-gray-500 text-sm leading-relaxed max-w-lg mx-auto mb-6">
            {displayName} is a verified partner of PatentPending.app. Clients referred by {displayName} receive guided patent filing through our AI-powered platform.
          </p>
        )}

        {/* CTA */}
        <Link
          href={signupUrl}
          className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-xl font-bold text-base hover:bg-[#2d3561] transition-colors mb-3"
        >
          Start Your Patent with {(partner.firm_name ?? partner.full_name ?? '').split(' ')[0]} →
        </Link>
        <p className="text-xs text-gray-400">
          You&apos;ll be linked to {displayName}&apos;s partner account automatically.
        </p>
      </div>

      {/* What happens next */}
      <section className="bg-gray-50 py-12 px-4">
        <div className="max-w-xl mx-auto">
          <h2 className="text-lg font-bold text-[#1a1f36] text-center mb-6">What happens next</h2>
          <div className="space-y-4">
            {[
              { step: '01', title: 'Create your account', body: 'Sign up with your email. Your account is automatically linked to ' + displayName + '.' },
              { step: '02', title: 'Describe your invention', body: 'Answer a few questions and PatentPending generates your first draft claims in minutes.' },
              { step: '03', title: 'Review and file', body: 'Review your AI-drafted spec, claims, and figures. File directly with the USPTO through our guided workflow.' },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4">
                <span className="text-xs font-bold text-gray-300 mt-1 w-6 flex-shrink-0">{step}</span>
                <div>
                  <div className="font-semibold text-[#1a1f36] text-sm">{title}</div>
                  <div className="text-gray-500 text-sm leading-relaxed mt-0.5">{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <div className="py-12 px-4 text-center">
        <Link
          href={signupUrl}
          className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-xl font-bold text-base hover:bg-[#2d3561] transition-colors"
        >
          Get Started →
        </Link>
        <p className="text-xs text-gray-400 mt-3">
          Questions? <Link href="/partners" className="text-indigo-500 hover:underline">Learn about the Partner Program</Link>
        </p>
      </div>

      {/* Footer */}
      <footer className="py-6 px-4 text-center text-xs text-gray-400 border-t border-gray-100">
        <p>PatentPending.app</p>
        <p className="mt-1">PatentPending.app is not a law firm and does not provide legal advice. This page is published by a PatentPending Partner.</p>
      </footer>
    </div>
  )
}
