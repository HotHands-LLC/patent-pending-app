/**
 * usePatentLifecycle.ts
 * React hook exposing the patent lifecycle state machine for a given patent.
 * Prompt 52A — pure data layer, no JSX.
 */

import type { Patent } from '@/lib/supabase'
import {
  PATENT_LIFECYCLE,
  getBlockingConditions,
  getNextNodes,
  type PatentLifecycleState,
  type PatentContext,
} from '@/lib/patent-lifecycle'

export function usePatentLifecycle(patentOrContext: Patent & { lifecycle_state?: string | null } | PatentContext) {
  const context: PatentContext = 'patent' in patentOrContext
    ? patentOrContext as PatentContext
    : { patent: patentOrContext as Patent & { lifecycle_state?: string | null } }

  const state = (context.patent.lifecycle_state ?? 'DRAFT') as PatentLifecycleState
  const definition = PATENT_LIFECYCLE[state]
  const blocking = getBlockingConditions(context)
  const nextNodes = getNextNodes(state)

  return {
    state,
    definition,
    blocking,
    nextNodes,
    isBlocked: blocking.length > 0,
    pattieShouldAct: blocking.some(b => b.pattie_can_act),
    urgency: definition.urgency,
    label: definition.label,
    phase: definition.phase,
  }
}
