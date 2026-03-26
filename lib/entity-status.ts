/**
 * lib/entity-status.ts — USPTO entity status helper
 *
 * Entity status determines filing fees at USPTO.
 * Small Entity is the safe default for individual inventors / small companies.
 * Micro Entity requires income < ~$239K AND ≤ 4 prior NPs AND no large-entity obligation.
 *
 * Hot Hands IP LLC = Small Entity (confirmed March 26, 2026 — ADS v2 for QR+).
 */

export type EntityStatus = 'micro' | 'small' | 'large'

/** Get the effective entity status for a patent, falling back to profile then 'small' */
export function getEntityStatus(
  patentEntityStatus?: string | null,
  profileEntityStatus?: string | null
): EntityStatus {
  const valid = (s: string | null | undefined): s is EntityStatus =>
    s === 'micro' || s === 'small' || s === 'large'
  if (valid(patentEntityStatus)) return patentEntityStatus
  if (valid(profileEntityStatus)) return profileEntityStatus
  return 'small' // safe default
}

/** USPTO non-provisional filing fee estimates by entity status (2025 rates) */
export function getEntityFees(status: EntityStatus) {
  return {
    micro:  { basic: 320,  search: 250, exam: 400,  label: 'Micro Entity',  description: 'Income < ~$239K, ≤ 4 prior NPs' },
    small:  { basic: 720,  search: 500, exam: 800,  label: 'Small Entity',  description: 'Individual inventor or <500 employees' },
    large:  { basic: 1440, search: 1000, exam: 1600, label: 'Large Entity',  description: 'Corporation >500 employees' },
  }[status]
}

/** Total estimated filing fees */
export function getTotalFee(status: EntityStatus): number {
  const fees = getEntityFees(status)
  return fees.basic + fees.search + fees.exam
}
