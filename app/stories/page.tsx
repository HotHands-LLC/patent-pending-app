import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const metadata: Metadata = {
  title: 'Inventor Stories | patentpending.app',
  description: 'Independent inventors who filed their own patents — without paying $10K in legal fees.',
}

async function getStories() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const { data } = await svc.from('inventor_stories')
    .select('id, slug, first_name, title, patent_title, score, filed_at')
    .eq('opt_in_public', true)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}

export default async function StoriesPage() {
  const stories = await getStories()
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-lg font-bold text-[#1a1f36]">⚖️ PatentPending</Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-600">Inventor Stories</span>
      </nav>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-[#1a1f36] mb-3">Independent Inventors Who Filed Their Own Patent</h1>
          <p className="text-gray-500 text-lg">Without paying $10,000 in legal fees.</p>
        </div>
        {stories.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">First stories coming soon.</p>
            <Link href="/signup" className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700">
              File your own patent →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stories.map(s => (
              <Link key={s.id} href={`/stories/${s.slug}`}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-indigo-300 hover:shadow-sm transition-all group">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg mb-4">
                  {s.first_name[0]}
                </div>
                <p className="font-bold text-[#1a1f36] text-sm">{s.first_name}</p>
                <p className="text-xs text-gray-500 mb-2 truncate">{s.patent_title}</p>
                {s.score && <p className="text-xs text-indigo-600 font-semibold">Score: {s.score}/100</p>}
                {s.filed_at && <p className="text-xs text-gray-400">Filed {new Date(s.filed_at).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</p>}
                <p className="text-xs text-indigo-600 mt-3 group-hover:underline">Read story →</p>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-16 text-center bg-indigo-50 rounded-2xl p-8">
          <h2 className="font-bold text-[#1a1f36] text-xl mb-2">Have a patent story to share?</h2>
          <p className="text-gray-500 text-sm mb-4">Join the community of independent inventors filing their own patents.</p>
          <Link href="/signup" className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700">
            Start filing for free →
          </Link>
        </div>
      </div>
    </div>
  )
}
