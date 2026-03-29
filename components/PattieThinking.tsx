'use client'
import { useEffect, useState } from 'react'

interface PattieThinkingProps {
  stage?: string
  stages?: string[]
  variant?: 'inline' | 'card' | 'overlay' | 'dot'
  error?: boolean
  onRetry?: () => void
}

const DEFAULT_STAGES = [
  'Pattie is thinking…',
  'Analyzing your content…',
  'Working on it…',
]

export default function PattieThinking({
  stage, stages, variant = 'inline', error = false, onRetry,
}: PattieThinkingProps) {
  const stageList = stages ?? (stage ? [stage] : DEFAULT_STAGES)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (stageList.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % stageList.length), 3000)
    return () => clearInterval(t)
  }, [stageList.length])

  const currentStage = stageList[idx]
  const icon = error ? '⚠️' : '✨'
  const text = error ? 'Pattie ran into an issue.' : currentStage

  if (variant === 'dot') {
    return (
      <span className="flex items-center gap-1.5">
        <span className={`text-sm ${error ? '' : 'animate-pulse'}`}>{icon}</span>
        <span className="text-xs">{text}</span>
        {error && onRetry && (
          <button onClick={onRetry} className="text-xs text-indigo-600 hover:underline ml-1">Try again</button>
        )}
      </span>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-indigo-600 py-1">
        <span className={error ? '' : 'animate-pulse'}>{icon}</span>
        <span>{text}</span>
        {error && onRetry && (
          <button onClick={onRetry} className="text-indigo-600 hover:underline ml-1 font-semibold">[Try again]</button>
        )}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
        <span className={`text-2xl mb-3 ${error ? '' : 'animate-pulse'}`}>{icon}</span>
        <p className="text-sm font-semibold text-indigo-800 mb-1">{text}</p>
        {!error && <div className="flex gap-1 mt-2">
          {[0,1,2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }} />
          ))}
        </div>}
        {error && onRetry && (
          <button onClick={onRetry} className="mt-3 text-xs text-indigo-600 hover:underline font-semibold">[Try again]</button>
        )}
      </div>
    )
  }

  if (variant === 'overlay') {
    return (
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
        <div className="text-center">
          <span className={`text-2xl mb-2 block ${error ? '' : 'animate-pulse'}`}>{icon}</span>
          <p className="text-sm font-semibold text-indigo-800">{text}</p>
          {error && onRetry && (
            <button onClick={onRetry} className="mt-2 text-xs text-indigo-600 hover:underline">[Try again]</button>
          )}
        </div>
      </div>
    )
  }

  return null
}
