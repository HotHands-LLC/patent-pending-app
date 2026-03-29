'use client'
/**
 * PattieSuggestionCards — P-Fix-3b
 *
 * Renders up to 3 proactive suggestion cards above the Pattie chat input.
 * Cards are loaded on patent page mount via /api/patents/[id]/suggestion-cards.
 * No LLM calls — pure DB logic on the server.
 *
 * "Yes, let's do it" → fires card message into Pattie chat → card collapses.
 * "Not now" → dismisses + logs to patent_activity_log (pattie_suggestion_rejected).
 *
 * Dismissed cards are suppressed for 24h (except deadline_critical which always shows).
 */

import { useEffect, useState } from 'react'

export interface SuggestionCard {
  card_type: string
  message: string
  suppressible: boolean
}

interface PattieSuggestionCardsProps {
  patentId: string
  authToken: string
  /** Called when user clicks "Yes, let's do it" — sends the message into Pattie */
  onAccept: (message: string) => void
}

export default function PattieSuggestionCards({
  patentId,
  authToken,
  onAccept,
}: PattieSuggestionCardsProps) {
  const [cards, setCards] = useState<SuggestionCard[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!patentId || !authToken) return
    let cancelled = false
    fetch(`/api/patents/${patentId}/suggestion-cards`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setCards(d.cards ?? [])
      })
      .catch(() => {/* non-blocking */})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patentId, authToken])

  async function handleDismiss(card: SuggestionCard) {
    setDismissed(prev => new Set(prev).add(card.card_type))
    // Log to patent_activity_log (fire & forget)
    fetch(`/api/patents/${patentId}/suggestion-cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        card_type: card.card_type,
        dismissed_at: new Date().toISOString(),
      }),
    }).catch(() => {/* non-blocking */})
  }

  function handleAccept(card: SuggestionCard) {
    setAccepted(prev => new Set(prev).add(card.card_type))
    onAccept(card.message)
  }

  const visibleCards = cards.filter(
    c => !dismissed.has(c.card_type) && !accepted.has(c.card_type)
  )

  if (loading || visibleCards.length === 0) return null

  return (
    <div className="px-4 pt-2 pb-1 space-y-2">
      {visibleCards.map(card => (
        <SuggestionCardUI
          key={card.card_type}
          card={card}
          onAccept={() => handleAccept(card)}
          onDismiss={() => handleDismiss(card)}
        />
      ))}
    </div>
  )
}

function SuggestionCardUI({
  card,
  onAccept,
  onDismiss,
}: {
  card: SuggestionCard
  onAccept: () => void
  onDismiss: () => void
}) {
  const isUrgent = card.card_type === 'deadline_critical'

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex flex-col gap-2.5 shadow-sm
        ${isUrgent
          ? 'bg-red-50 border-red-300'
          : 'bg-indigo-50 border-indigo-200'
        }`}
    >
      {/* Icon + message */}
      <div className="flex items-start gap-2">
        <span className="text-base leading-tight mt-0.5 flex-shrink-0" aria-hidden>
          {isUrgent ? '⚠️' : '💡'}
        </span>
        <p className={`text-sm leading-snug font-medium ${isUrgent ? 'text-red-800' : 'text-indigo-800'}`}>
          {card.message}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onAccept}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors
            ${isUrgent
              ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
            }`}
        >
          Yes, let&apos;s do it
        </button>
        {card.suppressible && (
          <button
            onClick={onDismiss}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${isUrgent
                ? 'border-red-200 text-red-600 hover:bg-red-100 bg-white/70'
                : 'border-indigo-200 text-indigo-600 hover:bg-indigo-100 bg-white/70'
              }`}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
