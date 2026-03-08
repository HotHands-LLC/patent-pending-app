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
 * Middleware: Custom domain → partner profile rewrite.
 *
 * If a verified partner has set custom_domain = 'patents.example.com',
 * any request to that hostname is rewritten to /p/[slug].
 *
 * Only fires for verified custom domains (custom_domain_verified = true).
 * Everything else passes through.
 */
export async function middleware(req: NextRequest) {
  const { hostname, pathname } = req.nextUrl

  // Skip if this is the app's own domain
  if (APP_HOSTS.has(hostname) || hostname.endsWith('.vercel.app')) {
    return NextResponse.next()
  }

  // Only rewrite root-level requests to a custom domain (not API, _next, etc.)
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  try {
    // Look up custom domain in partner_profiles
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
      return NextResponse.rewrite(rewriteUrl)
    }
  } catch {
    // DB error — pass through
  }

  return NextResponse.next()
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
