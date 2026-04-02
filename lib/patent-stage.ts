/**
 * patent-stage.ts
 * Stage-advancement engine for PatentPending.app
 * Derives the correct lifecycle stage from patent DB fields.
 */

import type { Patent } from '@/lib/supabase'

export type PatentStage =
  | 'idea'
  | 'claims'
  | 'spec'
  | 'figures'
  | 'provisional'
  | 'nonprovisional'
  | 'examination'
  | 'granted'

/**
 * deriveStage — evaluate patent fields and return the highest applicable stage.
 * Stages are ordered from lowest to highest; returns the highest one that applies.
 */
export function deriveStage(patent: Patent): PatentStage {
  // granted — patent_number is set
  if (patent.patent_number) {
    return 'granted'
  }

  // examination — lifecycle_state = 'EXAMINATION' or uspto_status has examination data
  if (
    patent.lifecycle_state === 'EXAMINATION' ||
    (typeof patent.uspto_status === 'string' &&
      patent.uspto_status.toLowerCase().includes('examin'))
  ) {
    return 'examination'
  }

  // nonprovisional — application_number is set (status = 'filed')
  if (patent.application_number) {
    return 'nonprovisional'
  }

  // provisional — provisional_app_number is set OR provisional_filed_at is set
  if (patent.provisional_app_number || patent.provisional_filed_at) {
    return 'provisional'
  }

  // figures — figures_uploaded = true
  if (patent.figures_uploaded === true) {
    return 'figures'
  }

  // spec — has spec_draft
  if (patent.spec_draft) {
    return 'spec'
  }

  // claims — has claims_draft
  if (patent.claims_draft) {
    return 'claims'
  }

  // idea — has title only (default)
  return 'idea'
}

/**
 * stageIndex — returns numeric index for a stage (for progress UI)
 */
export const STAGE_ORDER: PatentStage[] = [
  'idea',
  'claims',
  'spec',
  'figures',
  'provisional',
  'nonprovisional',
  'examination',
  'granted',
]

export function stageIndex(stage: PatentStage): number {
  return STAGE_ORDER.indexOf(stage)
}
