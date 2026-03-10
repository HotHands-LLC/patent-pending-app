import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Patent = {
  id: string
  owner_id: string
  title: string
  description: string | null
  inventors: string[]
  status: 'provisional' | 'non_provisional' | 'published' | 'granted' | 'abandoned'
  provisional_number: string | null
  application_number: string | null
  filing_date: string | null
  provisional_deadline: string | null
  non_provisional_deadline: string | null
  uspto_status: string | null
  last_uspto_check: string | null
  asking_price: number | null
  is_listed: boolean
  tags: string[]
  created_at: string
  updated_at: string
  // Phase 2+ fields (optional — only present after payment/intake)
  current_phase?: number | null         // 1–7 filing phases
  filing_status?: string | null         // 'draft' | 'approved' | 'filed'
  claims_status?: 'pending' | 'generating' | 'complete' | 'failed' | 'refining' | 'refined' | null
  claims_draft_pre_refine?: string | null
  claims_draft?: string | null
  claims_draft_research_pending?: string | null
  research_completed_at?: string | null
  claims_score?: Record<string, unknown> | null  // jsonb — see lib/claims-score.ts ClaimsScore
  abstract_draft?: string | null
  intake_session_id?: string | null
  payment_confirmed_at?: string | null
  stripe_checkout_session_id?: string | null
  // Filing journey (cont.10)
  spec_uploaded?: boolean
  figures_uploaded?: boolean
  cover_sheet_acknowledged?: boolean
  // Spec drafting (cont.11)
  spec_draft?: string | null
  // Arc 3 (cont.17)
  arc3_active?: boolean
  slug?: string | null
  licensing_exclusive?: boolean
  licensing_nonexclusive?: boolean
  licensing_field_of_use?: boolean
  deal_page_summary?: string | null
  deal_page_market?: string | null
  is_locked?: boolean
  patent_number?: string | null
  ownership_verified?: boolean
}

export type PatentDeadline = {
  id: string
  patent_id: string
  owner_id: string
  deadline_type: string
  due_date: string
  status: 'pending' | 'completed' | 'missed' | 'extended'
  notes: string | null
  alert_sent: boolean
  created_at: string
  patents?: { title: string }
}

export function getDaysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function getUrgencyBadge(days: number): string {
  if (days <= 30) return 'bg-red-100 text-red-800 border border-red-200'
  if (days <= 90) return 'bg-yellow-100 text-yellow-800 border border-yellow-200'
  return 'bg-green-100 text-green-800 border border-green-200'
}

export function getUrgencyText(days: number): string {
  if (days < 0) return `OVERDUE by ${Math.abs(days)} days`
  if (days === 0) return 'DUE TODAY'
  return `${days} days remaining`
}

export type PatentCorrespondence = {
  id: string
  patent_id: string | null
  owner_id: string
  title: string
  type: 'uspto_action' | 'email' | 'filing' | 'attorney_note' | 'boclaw_note' | 'deadline_notice' | 'other'
  content: string | null
  from_party: string | null
  to_party: string | null
  correspondence_date: string
  attachments: unknown[]
  tags: string[] | null
  created_at: string
  updated_at: string
  patents?: { title: string; id: string } | null
}

export const CORRESPONDENCE_TYPE_LABELS: Record<string, string> = {
  uspto_action: 'USPTO Action',
  filing: 'Filing',
  email: 'Email',
  attorney_note: 'Attorney Note',
  boclaw_note: 'Pattie Note',
  deadline_notice: 'Deadline Notice',
  other: 'Other',
}

export const CORRESPONDENCE_TYPE_COLORS: Record<string, string> = {
  uspto_action: 'bg-red-100 text-red-800 border border-red-200',
  filing: 'bg-blue-100 text-blue-800 border border-blue-200',
  email: 'bg-gray-100 text-gray-700 border border-gray-200',
  attorney_note: 'bg-purple-100 text-purple-800 border border-purple-200',
  boclaw_note: 'bg-orange-100 text-orange-800 border border-orange-200',
  deadline_notice: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  other: 'bg-gray-100 text-gray-600 border border-gray-200',
}
