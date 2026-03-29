// USPTO Fee Schedule — Effective January 19, 2025 (Last Revised January 1, 2026)
// Source: https://www.uspto.gov/sites/default/files/documents/USPTO-fee-schedule_current.pdf
// Fee codes: provisional 1005 (large) / 2005 (small) / 3005 (micro) — 37 CFR 1.16(d)
// WISHLIST: Auto-sync from USPTO API when one becomes available
// Manual review recommended each January when USPTO updates schedule

export const USPTO_FEES = {
  provisional: {
    large: 325,
    small: 130,
    micro: 65,
  },
  nonProvisional: {
    basicFiling: {
      large: 350,
      small: 140,
      micro: 70,
    },
    search: {
      large: 770,
      small: 308,
      micro: 154,
    },
    examination: {
      large: 880,
      small: 352,
      micro: 176,
    },
    total: {
      large: 2000,
      small: 800,
      micro: 400,
    },
  },
} as const

// Formatted display strings for UI use
export const USPTO_FEE_DISPLAY = {
  provisional: {
    micro: `$${USPTO_FEES.provisional.micro}`,
    small: `$${USPTO_FEES.provisional.small}`,
    large: `$${USPTO_FEES.provisional.large}`,
  },
  nonProvisional: {
    total: {
      micro: `$${USPTO_FEES.nonProvisional.total.micro.toLocaleString()}`,
      small: `$${USPTO_FEES.nonProvisional.total.small.toLocaleString()}`,
      large: `$${USPTO_FEES.nonProvisional.total.large.toLocaleString()}`,
    },
  },
}

// Human-readable fee summary for inline text
export const PROVISIONAL_FEE_SUMMARY =
  `$${USPTO_FEES.provisional.micro} micro entity / $${USPTO_FEES.provisional.small} small entity / $${USPTO_FEES.provisional.large} large entity`

export const NONPROV_TOTAL_SUMMARY =
  `$${USPTO_FEES.nonProvisional.total.micro} micro / $${USPTO_FEES.nonProvisional.total.small} small / $${USPTO_FEES.nonProvisional.total.large.toLocaleString()} large`
