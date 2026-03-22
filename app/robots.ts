import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/marketplace', '/patents/'],
      disallow: ['/dashboard/', '/admin/', '/api/'],
    },
    sitemap: 'https://patentpending.app/sitemap.xml',
  }
}
