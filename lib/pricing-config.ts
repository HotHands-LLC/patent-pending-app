// lib/pricing-config.ts
// Single source of truth for all pricing values displayed to users.
// Update here — propagates to all system prompts and UI.

export const PRICING = {
  pro: {
    monthly: 39,
    annual: 390,
    annualMonthlyEquiv: 32.50,
  },
  marketplace: {
    successFeePercent: 10,
  },
  referral: {
    firstYearPercent: 20,
  },
  uspto: {
    microEntityMinFee: 65,
  },
  competitors: {
    legalzoom: 999,
    lawFirmMin: 5500,
    attorneyHourlyMin: 200,
    attorneyHourlyMax: 500,
  },
} as const

export const PRICING_COPY = {
  freeTier: 'Interview, Pattie conversations, 5 autoresearch queries/month, 1 patent in dashboard, marketplace listing — no credit card required.',
  proMonthly: `$${PRICING.pro.monthly}/month`,
  proAnnual: `$${PRICING.pro.annual}/year`,
  proDescription: 'All filing document exports (spec, claims, ADS, cover sheet, IDS draft), unlimited autoresearch, multiple patents.',
  marketplaceFee: `${PRICING.marketplace.successFeePercent}% success fee on verified deals (patent sale, licensing, settlement).`,
  referralFee: `${PRICING.referral.firstYearPercent}% of referred client's first year Pro subscription (launching soon).`,
} as const
