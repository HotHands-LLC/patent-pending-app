// lib/review.ts

// BoClaw's submit-to-review-queue function.
// Call this instead of posting draft text to Telegram.
// After calling: message Chad in Telegram with a short ✅ notification only.

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co')
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key')

export interface ReviewSubmission {
  patent_id: string
  owner_id: string
  draft_type: 'claims' | 'spec_section' | 'abstract' | 'drawing_brief' | 'forms' | 'misc'
  title: string
  content: string
  version?: number
}

export interface ReviewResult {
  id: string
  status: string
  error?: string
}

export async function submitForReview(submission: ReviewSubmission): Promise<ReviewResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/review_queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      patent_id: submission.patent_id,
      owner_id: submission.owner_id,
      draft_type: submission.draft_type,
      title: submission.title,
      content: submission.content,
      version: submission.version ?? 1,
      status: 'pending',
      submitted_by: 'boclaw',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return { id: '', status: 'error', error: err }
  }

  const [data] = await res.json()
  return { id: data.id, status: data.status }
}

// Convenience: get all pending reviews for a user
export async function getPendingReviews(ownerIdJwt: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/review_queue?status=eq.pending&order=created_at.desc&select=*,patents(title)`,
    {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${ownerIdJwt}`,
      },
    }
  )
  if (!res.ok) return []
  return res.json()
}
