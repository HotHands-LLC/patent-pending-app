'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useUtm } from '@/hooks/useUtm'

// ── Variant config ─────────────────────────────────────────────────────────────
interface HeroVariant {
  badge?: string
  headline: string
  subheadline: string
  ctaLabel: string
  ctaHref: string
  secondaryCta?: { label: string; href: string }
}

const DEFAULT_VARIANT: HeroVariant = {
  badge: 'AI-powered patent assistant',
  headline: 'File Patents with Confidence',
  subheadline:
    'Pattie guides you from idea to filing-ready draft. Track deadlines, manage your portfolio, and connect with buyers — all in one place.',
  ctaLabel: 'Start for Free →',
  ctaHref: '/signup',
}

const VARIANTS: Record<string, HeroVariant> = {
  reddit: {
    badge: '👋 Fellow inventor here',
    headline: "Built for inventors who don't want to pay $15k in attorney fees",
    subheadline:
      "You had the idea. You did the research. Why hand $15k to an attorney for paperwork? Pattie writes your patent draft, tracks your deadlines, and actually explains what everything means.",
    ctaLabel: 'Try it free — no credit card',
    ctaHref: '/signup',
    secondaryCta: { label: 'See how it works →', href: '/demo' },
  },
  linkedin: {
    badge: 'IP strategy for founders',
    headline: 'The AI patent platform for serious inventors',
    subheadline:
      'Build an IP portfolio that protects your moat, impresses investors, and moves at startup speed. Pattie handles filings, deadlines, and portfolio tracking — so you can focus on building.',
    ctaLabel: 'Get started free →',
    ctaHref: '/signup',
    secondaryCta: { label: 'View pricing →', href: '/pricing' },
  },
  email: {
    badge: '👋 Welcome back',
    headline: 'Welcome back — your patent dashboard awaits',
    subheadline:
      "Your deadlines won't wait. Log back in to see where your filings stand and what's due next.",
    ctaLabel: 'Go to my dashboard →',
    ctaHref: '/dashboard',
    secondaryCta: { label: 'Not you? Sign up free', href: '/signup' },
  },
}

function getVariant(utmSource: string | null | undefined): HeroVariant {
  if (!utmSource) return DEFAULT_VARIANT
  return VARIANTS[utmSource.toLowerCase()] ?? DEFAULT_VARIANT
}

// ── Inner hero (needs useUtm which requires Suspense) ─────────────────────────
function HeroInner() {
  const { utm_source } = useUtm()
  const v = getVariant(utm_source)

  return (
    <div className="pt-20 pb-16 text-center">
      {v.badge && (
        <div className="inline-block px-3 py-1 bg-[#f5a623]/10 text-[#f5a623] rounded-full text-sm font-medium mb-6 border border-[#f5a623]/20">
          {v.badge}
        </div>
      )}
      <h1 className="text-5xl font-bold text-[#1a1f36] mb-6 leading-tight">
        {v.headline}
      </h1>
      <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
        {v.subheadline}
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <Link
          href={v.ctaHref}
          className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors"
        >
          {v.ctaLabel}
        </Link>
        {v.secondaryCta && (
          <Link
            href={v.secondaryCta.href}
            className="inline-block px-8 py-4 border border-gray-200 text-gray-600 rounded-lg font-semibold text-lg hover:border-gray-400 transition-colors"
          >
            {v.secondaryCta.label}
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Exported component (wrapped in Suspense for useSearchParams) ──────────────
export default function HomepageHero() {
  return (
    <Suspense fallback={
      <div className="pt-20 pb-16 text-center">
        <div className="inline-block px-3 py-1 bg-[#f5a623]/10 text-[#f5a623] rounded-full text-sm font-medium mb-6 border border-[#f5a623]/20">
          AI-powered patent assistant
        </div>
        <h1 className="text-5xl font-bold text-[#1a1f36] mb-6 leading-tight">
          File Patents with Confidence
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
          Pattie guides you from idea to filing-ready draft. Track deadlines, manage your portfolio, and connect with buyers — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link href="/signup" className="inline-block px-8 py-4 bg-[#1a1f36] text-white rounded-lg font-semibold text-lg hover:bg-[#2d3561] transition-colors">
            Start for Free →
          </Link>
        </div>
      </div>
    }>
      <HeroInner />
    </Suspense>
  )
}
