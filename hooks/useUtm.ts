'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export const UTM_LOCAL_STORAGE_KEY = 'pp_utm_first'

export type UtmSource = 'reddit' | 'linkedin' | 'email' | string | null

export interface UtmData {
  utm_source: UtmSource
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
}

const EMPTY: UtmData = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
}

/** Read first-visit UTM from localStorage (persisted across sessions). */
export function getStoredFirstUtm(): UtmData {
  if (typeof window === 'undefined') return EMPTY
  try {
    return JSON.parse(localStorage.getItem(UTM_LOCAL_STORAGE_KEY) ?? 'null') ?? EMPTY
  } catch {
    return EMPTY
  }
}

/**
 * Hook: reads UTM params from URL → persists to localStorage on first visit.
 * Returns the active UTM data (URL takes priority over stored).
 */
export function useUtm(): UtmData {
  const searchParams = useSearchParams()
  const [utm, setUtm] = useState<UtmData>(EMPTY)

  useEffect(() => {
    const fromUrl: Partial<UtmData> = {}
    const keys: (keyof UtmData)[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    for (const key of keys) {
      const val = searchParams.get(key)
      if (val) (fromUrl as Record<string, string>)[key] = val
    }

    const hasUrlUtm = Object.keys(fromUrl).length > 0

    if (hasUrlUtm) {
      const merged: UtmData = { ...EMPTY, ...fromUrl }
      // Store to localStorage only if not already set (preserve first-visit attribution)
      if (!localStorage.getItem(UTM_LOCAL_STORAGE_KEY)) {
        try { localStorage.setItem(UTM_LOCAL_STORAGE_KEY, JSON.stringify(merged)) } catch { /* private browsing */ }
      }
      setUtm(merged)
    } else {
      // Fall back to stored first-visit UTM
      setUtm(getStoredFirstUtm())
    }
  }, [searchParams])

  return utm
}
