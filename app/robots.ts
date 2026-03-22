import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/marketplace', '/patents/', '/blog', '/pricing', '/demo'],
      disallow: ['/dashboard/', '/admin/', '/api/', '/intake/'],
    },
    sitemap: 'https://patentpending.app/sitemap.xml',
  }
}
