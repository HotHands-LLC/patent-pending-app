import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import HomepageClient from './HomepageClient'

export const metadata: Metadata = {
  title: 'PatentPending — Patent Filing, Simplified',
  description: 'Ask Pattie anything about patents. File, manage, and license your IP with AI-powered guidance. No attorney required.',
}

const supabaseService = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co'),
  (process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key')
)

export default async function HomePage() {
  // Featured marketplace listings — top 3 by readiness score (or just published)
  const { data: listings } = await supabaseService
    .from('patents')
    .select('id, title, marketplace_slug, deal_page_brief, ip_readiness_score, status')
    .eq('marketplace_enabled', true)
    .not('marketplace_published_at', 'is', null)
    .order('ip_readiness_score', { ascending: false, nullsFirst: false })
    .order('marketplace_published_at', { ascending: false })
    .limit(3)

  return <HomepageClient listings={listings ?? []} />
}
