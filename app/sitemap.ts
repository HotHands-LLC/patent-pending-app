import { createClient } from '@supabase/supabase-js'
import type { MetadataRoute } from 'next'

const BASE_URL = 'https://patentpending.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  // Static pages
  const staticEntries: MetadataRoute.Sitemap = [
    { url: BASE_URL,                   lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE_URL}/marketplace`,  lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE_URL}/blog`,         lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE_URL}/pricing`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ]

  // Blog posts
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, updated_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)

  const blogEntries: MetadataRoute.Sitemap = (posts ?? []).map(post => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at ? new Date(post.updated_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // Patent deal pages — only index patents that are investment-open OR provisional_ready
  // Never index archived patents
  const { data: patents } = await supabase
    .from('patents')
    .select('slug, updated_at, created_at')
    .not('slug', 'is', null)
    .neq('status', 'archived')
    .or('investment_open.eq.true,status.eq.provisional')
    .order('created_at', { ascending: false })
    .limit(200)

  const patentEntries: MetadataRoute.Sitemap = (patents ?? [])
    .filter(p => p.slug)
    .map(p => ({
      url: `${BASE_URL}/patents/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(p.created_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  return [...staticEntries, ...blogEntries, ...patentEntries]
}
