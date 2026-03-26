import type { Metadata } from 'next'
import ScoreCardClient from './ScoreCardClient'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'}/api/p/${slug}`, { next: { revalidate: 300 } })
    if (!res.ok) return { title: 'PatentScore™ | patentpending.app' }
    const d = await res.json()
    const score = d.composite_score ?? '—'
    return {
      title: `${d.title} — PatentScore™ ${score}/100 | patentpending.app`,
      description: `${d.title} scored ${score}/100 on the PatentScore™ index. File your own patent at patentpending.app.`,
      openGraph: {
        title: `${d.title} — PatentScore™ ${score}/100`,
        description: `Novelty: ${d.novelty_score ?? '—'} · Viability: ${d.viability_score ?? '—'} · Complexity: ${d.complexity_score ?? '—'}`,
        url: `https://patentpending.app/p/${slug}`,
        siteName: 'patentpending.app',
      },
      twitter: { card: 'summary_large_image', title: `${d.title} — PatentScore™ ${score}/100` },
    }
  } catch { return { title: 'PatentScore™ | patentpending.app' } }
}

export default function ScoreCardPage({ params }: Props) {
  return <ScoreCardClient params={params} />
}
