'use client'
import React from 'react'

interface PattieEntryCardProps {
  prompt: string              // "Pattie can draft your specification..."
  primaryLabel: string        // "Draft with Pattie"
  onPrimary: () => void       // Opens Pattie drawer with preloaded prompt
  secondaryLabel?: string     // "Write manually" (optional)
  onSecondary?: () => void    // Dismisses card
  icon?: string               // emoji or character, default "✨"
}

export default function PattieEntryCard({
  prompt,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  icon = '✨'
}: PattieEntryCardProps) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 flex gap-4 items-start mb-4">
      <div className="text-2xl flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-indigo-900 font-medium mb-3">{prompt}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onPrimary}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="px-3 py-1.5 border border-indigo-200 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-100 transition-colors"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
