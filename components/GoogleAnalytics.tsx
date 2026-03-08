'use client'
import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

// ── Event helper — safe to call from anywhere ─────────────────────────────────
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | null | undefined>
) {
  if (typeof window === 'undefined' || !GA_ID) return
  const w = window as typeof window & { gtag?: (...args: unknown[]) => void }
  if (typeof w.gtag === 'function') w.gtag('event', eventName, params ?? {})
}

// ── Page view tracker (uses router events) ────────────────────────────────────
function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
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
