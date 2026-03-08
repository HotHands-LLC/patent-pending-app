'use client'
import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export const UTM_STORAGE_KEY = 'pp_utm_params'

// UTM keys we capture
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
export type UtmParams = Partial<Record<typeof UTM_KEYS[number], string>>

/** Read stored UTM params from sessionStorage (safe, returns {} if none) */
export function getStoredUtm(): UtmParams {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) ?? '{}') } catch { return {} }
}

// ── Event helper — safe to call from anywhere ─────────────────────────────────
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | null | undefined>
) {
  if (typeof window === 'undefined' || !GA_ID) return
  const w = window as typeof window & { gtag?: (...args: unknown[]) => void }
  if (typeof w.gtag === 'function') w.gtag('event', eventName, params ?? {})
}

// ── Page view + UTM capture tracker ──────────────────────────────────────────
function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // 1. Capture UTM params from URL → sessionStorage (persists across page nav)
    const utmFound: UtmParams = {}
    UTM_KEYS.forEach(key => {
      const val = searchParams.get(key)
      if (val) utmFound[key] = val
    })
    if (Object.keys(utmFound).length > 0) {
      try { sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utmFound)) } catch { /* private browsing */ }
    }

    // 2. Fire page_view to GA
    if (!GA_ID) return
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
    const w = window as typeof window & { gtag?: (...args: unknown[]) => void }
    if (typeof w.gtag === 'function') {
      w.gtag('config', GA_ID, { page_path: url })
    }
  }, [pathname, searchParams])

  return null
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function GoogleAnalytics() {
  // Only fire in production and when GA_ID is set
  if (!GA_ID || process.env.NODE_ENV !== 'production') return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', {
            page_path: window.location.pathname,
            send_page_view: false
          });
        `}
      </Script>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  )
}
