'use client'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm max-w-xl w-full p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🚨</span>
          <h2 className="text-lg font-bold text-red-700">Admin panel error</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Something went wrong rendering the admin panel. The error details below will help diagnose it.
        </p>
        <div className="bg-gray-950 text-green-400 rounded-xl p-4 font-mono text-xs overflow-auto max-h-64 mb-4">
          <div className="text-white font-bold mb-2">{error.message}</div>
          {error.stack && (
            <pre className="whitespace-pre-wrap text-green-300 opacity-80 mt-2">
              {error.stack}
            </pre>
          )}
          {error.digest && (
            <div className="text-gray-500 mt-2 text-xs">digest: {error.digest}</div>
          )}
        </div>
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-[#1a1f36] text-white rounded-xl text-sm font-semibold hover:bg-[#2d3561] transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
