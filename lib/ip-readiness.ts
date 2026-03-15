// lib/ip-readiness.ts

// Computes a 0–100 IP Readiness Score for a patent.
// This is a *display metric* only — not a legal valuation.

export interface IpReadinessInput {
  provisional_filed_at?: string | null
  filing_status?: string | null
  spec_draft?: string | null
  claims_draft?: string | null
  abstract_draft?: string | null
  figures?: unknown[] | null
  deal_page_brief?: string | null
  marketplace_tags?: string[] | null
  asking_price_range?: string | null
}

export interface IpReadinessCriterion {
  label: string
  points: number
  met: boolean
}

export function computeIpReadinessScore(patent: IpReadinessInput): number {
  return getIpReadinessCriteria(patent).reduce(
    (sum, c) => sum + (c.met ? c.points : 0),
    0
  )
}

export function getIpReadinessCriteria(patent: IpReadinessInput): IpReadinessCriterion[] {
  return [
    {
      label: 'Provisional filed',
      points: 20,
      met: !!patent.provisional_filed_at,
    },
    {
      label: 'Patent issued / granted',
      points: 10,
      met: patent.filing_status === 'issued' || patent.filing_status === 'granted',
    },
    {
      label: 'Specification draft (500+ chars)',
      points: 15,
      met: !!(patent.spec_draft && patent.spec_draft.length > 500),
    },
    {
      label: 'Claims draft (200+ chars)',
      points: 15,
      met: !!(patent.claims_draft && patent.claims_draft.length > 200),
    },
    {
      label: 'Abstract draft (50+ chars)',
      points: 10,
      met: !!(patent.abstract_draft && patent.abstract_draft.length > 50),
    },
    {
      label: 'Figures attached',
      points: 10,
      met: !!(patent.figures && patent.figures.length > 0),
    },
    {
      label: 'Deal page brief (100+ chars)',
      points: 10,
      met: !!(patent.deal_page_brief && patent.deal_page_brief.length > 100),
    },
    {
      label: '3+ marketplace tags',
      points: 5,
      met: !!(patent.marketplace_tags && patent.marketplace_tags.length >= 3),
    },
    {
      label: 'Asking price set',
      points: 5,
      met: !!patent.asking_price_range,
    },
  ]
}
