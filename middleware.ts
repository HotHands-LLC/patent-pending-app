import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Hosts that are the app itself — never do custom-domain routing for these
const APP_HOSTS = new Set([
  'patentpending.app',
  'www.patentpending.app',
  'partners.patentpending.app',
  'localhost',
])

/**
 * Middleware: Custom domain → partner profile rewrite + referral cookie capture.
 *
 * 1. If a verified partner has set custom_domain = 'patents.example.com',
 *    any request to that hostname is rewritten to /p/[slug].
 * 2. If a `ref` query parameter is present (e.g. ?ref=ACMELAW), set a
 *    `ppa_ref` cookie with 30-day expiry for attribution tracking.
 *
 * Only fires for verified custom domains (custom_domain_verified = true).
 * Everything else passes through.
 */
export async function middleware(req: NextRequest) {
  const { hostname, pathname, searchParams } = req.nextUrl

  // ── Referral cookie capture ───────────────────────────────────────────────
  // Capture ?ref= on ANY path (even the app's own domain) before custom-domain logic
  const ref = searchParams.get('ref')
  let res: NextResponse | null = null

  // ── Custom-domain rewrite ─────────────────────────────────────────────────
  if (!APP_HOSTS.has(hostname) && !hostname.endsWith('.vercel.app')) {
    // Only rewrite root-level requests to a custom domain (not API, _next, etc.)
    if (!pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { data: pp } = await supabase
          .from('partner_profiles')
          .select('slug')
          .eq('custom_domain', hostname)
          .eq('custom_domain_verified', true)
          .eq('status', 'active')
          .single()

        if (pp?.slug) {
          // Rewrite to /p/[slug], preserving any path suffix
          const rewriteUrl = req.nextUrl.clone()
          rewriteUrl.hostname = req.nextUrl.hostname  // keep same origin for rewrite
          rewriteUrl.pathname = `/p/${pp.slug}${pathname === '/' ? '' : pathname}`
          res = NextResponse.rewrite(rewriteUrl)
        }
      } catch {
        // DB error — pass through
      }
    }
  }

  if (!res) {
    res = NextResponse.next()
  }

  // Set ppa_ref cookie if a valid ref param is present
  if (ref && /^[a-zA-Z0-9_-]{2,30}$/.test(ref)) {
    res.cookies.set('ppa_ref', ref, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
