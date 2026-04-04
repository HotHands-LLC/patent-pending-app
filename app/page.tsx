import Link from 'next/link'
import PattieHomepageChat from '@/components/PattieHomepageChat'

export const metadata = {
  title: 'PatentPending — AI Patent Assistant',
  description: 'Tell Pattie about your invention. She\'ll help you protect it.',
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-bold text-[#1a1f36]">⚖️ PatentPending</div>
          <div className="flex items-center gap-3">
            <Link
              href="/signup"
              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors"
            >
              Sign Up Free
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-[#1a1f36] text-white rounded-lg text-sm font-medium hover:bg-[#2d3561] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Main — Google-simple: just Pattie */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24">
        {/* Wordmark */}
        <div className="mb-2 text-sm font-medium text-indigo-600 tracking-wide uppercase">
          AI Patent Assistant
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-4xl font-bold text-[#1a1f36] text-center mb-10 leading-tight">
          What is your invention idea?
        </h1>

        {/* Pattie chat — center stage */}
        <div className="w-full max-w-2xl">
          <PattieHomepageChat />
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-gray-100 py-5">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <span>© {new Date().getFullYear()} Hot Hands LLC · PatentPending.app</span>
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:text-gray-600">About</Link>
            <Link href="/blog" className="hover:text-gray-600">Blog</Link>
            <Link href="/login" className="hover:text-gray-600">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
