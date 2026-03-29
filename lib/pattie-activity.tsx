'use client'
/**
 * PattieActivityContext — tracks when any Pattie API call is in-flight.
 * Components call setPattieActive(true/false) to show/hide global indicator.
 * Pulse bar reads from this context to show "✨ Pattie active".
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface PattieActivityContextType {
  pattieActive: boolean
  setPattieActive: (active: boolean) => void
  pattieStage: string
  setPattieStage: (stage: string) => void
}

const PattieActivityContext = createContext<PattieActivityContextType>({
  pattieActive: false,
  setPattieActive: () => {},
  pattieStage: '',
  setPattieStage: () => {},
})

export function PattieActivityProvider({ children }: { children: ReactNode }) {
  const [pattieActive, setPattieActiveState] = useState(false)
  const [pattieStage, setPattieStageState] = useState('')

  const setPattieActive = useCallback((active: boolean) => setPattieActiveState(active), [])
  const setPattieStage = useCallback((stage: string) => setPattieStageState(stage), [])

  return (
    <PattieActivityContext.Provider value={{ pattieActive, setPattieActive, pattieStage, setPattieStage }}>
      {children}
    </PattieActivityContext.Provider>
  )
}

export function usePattieActivity() {
  return useContext(PattieActivityContext)
}
