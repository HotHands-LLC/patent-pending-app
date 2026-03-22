import { createClient } from '@supabase/supabase-js'
import type { MetadataRoute } from 'next'

const BASE_URL = 'https://patentpending.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')
  )

  // Blog posts
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, updated_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)

  const blogEntries: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at ? new Date(post.updated_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // Patent deal pages — public-ready only:
  //   investment_open = true OR provisional_ready = true (in claw_patents)
  //   AND status != 'archived'
  //   AND arc3_active = true (deal page exists)
  //   AND slug is not null
  const { data: patentRows } = await supabase
    .from('patents')
    .select('slug, updated_at, id')
    .eq('arc3_active', true)
    .neq('status', 'archived')
    .not('slug', 'is', null)
    .or('investment_open.eq.true,status.eq.provisional')
    .order('updated_at', { ascending: false })
    .limit(500)

  // Also grab patents that graduated provisional_ready via claw
  const clawReadyIds = new Set<string>()
  if (patentRows && patentRows.length > 0) {
    const ids = patentRows.map(p => p.id)
    const { data: clawRows } = await supabase
      .from('claw_patents')
      .select('patent_id')
      .eq('provisional_ready', true)
      .in('patent_id', ids)
    for (const r of clawRows ?? []) clawReadyIds.add(r.patent_id)
  }

  // Additional patents from claw that may not have investment_open yet
  const { data: clawReadyPatents } = await supabase
    .from('claw_patents')
    .select('patent_id')
    .eq('provisional_ready', true)
    .not('patent_id', 'is', null)
  const allClawReadyIds = new Set((clawReadyPatents ?? []).map((r: { patent_id: string }) => r.patent_id))

  let extraPatents: MetadataRoute.Sitemap = []
  if (allClawReadyIds.size > 0) {
    const existingSlugs = new Set((patentRows ?? []).map(p => p.slug))
    const { data: extras } = await supabase
      .from('patents')
      .select('slug, updated_at')
      .in('id', [...allClawReadyIds])
      .neq('status', 'archived')
      .not('slug', 'is', null)
    extraPatents = (extras ?? [])
      .filter(p => p.slug && !existingSlugs.has(p.slug))
      .map(p => ({
        url: `${BASE_URL}/patents/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
  }

  const patentEntries: MetadataRoute.Sitemap = (patentRows ?? [])
    .filter(p => p.slug)
    .map(p => ({
      url: `${BASE_URL}/patents/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/marketplace`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...patentEntries,
    ...extraPatents,
    ...blogEntries,
  ]
}
