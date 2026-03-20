/**
 * pattie-tools.ts
 * Pattie's action tool layer — 6 tools for patent workflow automation.
 * Prompt 52B — PatentPending
 *
 * IMPORTANT: All clients are instantiated inside execute() — never at module level.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

export type PattieToolName =
  | 'create_signing_request'
  | 'send_reminder'
  | 'create_correspondence'
  | 'flag_for_review'
  | 'notify_owner'
  | 'generate_ids_draft'

export interface PattieToolParam {
  type: 'string' | 'boolean' | 'number'
  description: string
  required?: boolean
  enum?: string[]
}

export interface PattieTool {
  name: PattieToolName
  description: string
  parameters: Record<string, PattieToolParam>
  execute: (params: Record<string, unknown>, context: PattieActionContext) => Promise<PattieToolResult>
}

export interface PattieActionContext {
  patentId: string
  userId: string
  supabase: SupabaseClient
}

export interface PattieToolResult {
  success: boolean
  message: string
  data?: Record<string, unknown>
  error?: string
}

// ── Document label map ─────────────────────────────────────────────────────────

const DOCUMENT_LABELS: Record<string, string> = {
  aia_01: 'AIA Form AIA/01 (Inventor Declaration)',
  sb0015a: 'SB0015A (Micro Entity Declaration)',
  assignment: 'Patent Assignment Agreement',
  aia_08: 'AIA Form AIA/08 (Oath or Declaration)',
  other: 'Patent Document',
}

// ── Helper: today's date as ISO string ────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Tool: create_signing_request ───────────────────────────────────────────────

const createSigningRequest: PattieTool = {
  name: 'create_signing_request',
  description: 'Create a document signing request for a patent inventor or co-inventor',
  parameters: {
    signer_name: { type: 'string', description: 'Full name of the signer', required: true },
    signer_email: { type: 'string', description: 'Email address of the signer', required: true },
    document_type: {
      type: 'string',
      description: 'Type of document to sign',
      required: true,
      enum: ['aia_01', 'sb0015a', 'assignment', 'aia_08', 'other'],
    },
  },
  async execute(params, context) {
    const { patentId, userId, supabase } = context
    const signer_name = params.signer_name as string
    const signer_email = params.signer_email as string
    const document_type = params.document_type as string
    const document_label = DOCUMENT_LABELS[document_type] ?? DOCUMENT_LABELS.other

    try {
      // Fetch patent title
      const { data: patent, error: patentErr } = await supabase
        .from('patents')
        .select('title')
        .eq('id', patentId)
        .single()

      if (patentErr || !patent) {
        return { success: false, message: 'Could not fetch patent.', error: patentErr?.message }
      }

      // Insert signing request
      const { data: request, error: insertErr } = await supabase
        .from('patent_signing_requests')
        .insert({
          patent_id: patentId,
          requested_by: userId,
          signer_name,
          signer_email,
          document_type,
          document_label,
          status: 'pending',
          prefill_data: {},
          notification_sent_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertErr || !request) {
        return { success: false, message: 'Failed to create signing request.', error: insertErr?.message }
      }

      // Send invitation email via Resend SDK
      const resendKey = process.env.RESEND_API_KEY
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
      const signUrl = `${appUrl}/sign/${request.id}`

      if (resendKey) {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from: fromEmail,
          to: signer_email,
          subject: `Action required: Please sign your ${document_label} for "${patent.title}"`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2>Signature Required</h2>
  <p>Hi ${signer_name},</p>
  <p>You've been asked to sign <strong>${document_label}</strong> for the patent application <strong>"${patent.title}"</strong>.</p>
  <p style="margin:24px 0">
    <a href="${signUrl}" style="display:inline-block;background:#1a1f36;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Sign Document →</a>
  </p>
  <p style="color:#6b7280;font-size:13px">This link is unique to you. Please do not forward it.</p>
  <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
    PatentPending · <a href="${appUrl}" style="color:#6366f1">patentpending.app</a>
  </p>
</div>`,
        }).catch((err: unknown) => console.error('[pattie/create_signing_request] email error', err))
      }

      return { success: true, message: `Signing request created and sent to ${signer_email}.`, data: { requestId: request.id } }
    } catch (err) {
      console.error('[pattie/create_signing_request]', err)
      return { success: false, message: 'Unexpected error creating signing request.', error: String(err) }
    }
  },
}

// ── Tool: send_reminder ────────────────────────────────────────────────────────

const sendReminder: PattieTool = {
  name: 'send_reminder',
  description: 'Send an email reminder to the patent owner about a deadline or pending action',
  parameters: {
    subject: { type: 'string', description: 'Email subject line', required: true },
    body: { type: 'string', description: 'Email body content', required: true },
    recipient_email: { type: 'string', description: 'Recipient email address', required: true },
  },
  async execute(params, context) {
    const { patentId, supabase } = context
    const subject = params.subject as string
    const body = params.body as string
    const recipient_email = params.recipient_email as string

    try {
      const resendKey = process.env.RESEND_API_KEY
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'

      if (resendKey) {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from: fromEmail,
          to: recipient_email,
          subject,
          text: body,
        }).catch((err: unknown) => console.error('[pattie/send_reminder] email error', err))
      }

      // Log to correspondence
      await supabase.from('patent_correspondence').insert({
        patent_id: patentId,
        title: `Reminder: ${subject}`,
        content: body,
        type: 'ai_action',
        tags: ['pattie_action', 'reminder'],
        from_party: 'Pattie',
        correspondence_date: today(),
      })

      return { success: true, message: `Reminder sent to ${recipient_email}.` }
    } catch (err) {
      console.error('[pattie/send_reminder]', err)
      return { success: false, message: 'Failed to send reminder.', error: String(err) }
    }
  },
}

// ── Tool: create_correspondence ────────────────────────────────────────────────

const createCorrespondence: PattieTool = {
  name: 'create_correspondence',
  description: 'Create an internal correspondence note on a patent',
  parameters: {
    title: { type: 'string', description: 'Title of the correspondence note', required: true },
    content: { type: 'string', description: 'Content of the note', required: true },
    type: {
      type: 'string',
      description: 'Type of correspondence',
      required: true,
      enum: ['note', 'ai_action', 'status_change'],
    },
  },
  async execute(params, context) {
    const { patentId, supabase } = context
    const { title, content, type } = params as { title: string; content: string; type: string }

    try {
      // Fetch owner_id
      const { data: patent } = await supabase
        .from('patents')
        .select('owner_id')
        .eq('id', patentId)
        .single()

      const { error } = await supabase.from('patent_correspondence').insert({
        patent_id: patentId,
        owner_id: patent?.owner_id ?? undefined,
        title,
        content,
        type,
        from_party: 'Pattie',
        tags: ['pattie_action'],
        correspondence_date: today(),
      })

      if (error) {
        return { success: false, message: 'Failed to create correspondence note.', error: error.message }
      }

      return { success: true, message: 'Note added to patent correspondence.' }
    } catch (err) {
      console.error('[pattie/create_correspondence]', err)
      return { success: false, message: 'Unexpected error creating correspondence.', error: String(err) }
    }
  },
}

// ── Tool: flag_for_review ──────────────────────────────────────────────────────

const flagForReview: PattieTool = {
  name: 'flag_for_review',
  description: 'Flag a patent for urgent owner review and send a notification',
  parameters: {
    reason: { type: 'string', description: 'Reason for flagging this patent for review', required: true },
    urgency: {
      type: 'string',
      description: 'Urgency level of the review',
      required: true,
      enum: ['medium', 'high', 'critical'],
    },
  },
  async execute(params, context) {
    const { patentId, supabase } = context
    const reason = params.reason as string
    const urgency = params.urgency as string

    try {
      // Update patent flagged_for_review
      await supabase
        .from('patents')
        .update({ flagged_for_review: true })
        .eq('id', patentId)

      // Create correspondence note
      await createCorrespondence.execute(
        {
          title: `⚑ Flagged for Review (${urgency})`,
          content: reason,
          type: 'ai_action',
        },
        context
      )

      // Fetch owner email
      const { data: patent } = await supabase
        .from('patents')
        .select('owner_id, title')
        .eq('id', patentId)
        .single()

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://patentpending.app'
      const resendKey = process.env.RESEND_API_KEY
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'

      if (patent?.owner_id && resendKey) {
        const { data: profile } = await supabase
          .from('patent_profiles')
          .select('email')
          .eq('id', patent.owner_id)
          .single()

        if (profile?.email) {
          const { Resend } = await import('resend')
          const resend = new Resend(resendKey)
          await resend.emails.send({
            from: fromEmail,
            to: profile.email,
            subject: `[PatentPending] Patent flagged for review`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1f36">
  <h2>⚑ Patent Flagged for Review</h2>
  <p>Your patent <strong>"${patent.title}"</strong> has been flagged for urgent review.</p>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:0;font-weight:bold;color:#dc2626">Urgency: ${urgency.toUpperCase()}</p>
    <p style="margin:8px 0 0">${reason}</p>
  </div>
  <p style="margin:24px 0">
    <a href="${appUrl}/dashboard" style="display:inline-block;background:#1a1f36;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">View Dashboard →</a>
  </p>
  <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
    PatentPending · <a href="${appUrl}" style="color:#6366f1">patentpending.app</a>
  </p>
</div>`,
          }).catch((err: unknown) => console.error('[pattie/flag_for_review] email error', err))
        }
      }

      return { success: true, message: 'Patent flagged for review. Owner notified.' }
    } catch (err) {
      console.error('[pattie/flag_for_review]', err)
      return { success: false, message: 'Failed to flag patent for review.', error: String(err) }
    }
  },
}

// ── Tool: notify_owner ─────────────────────────────────────────────────────────

const notifyOwner: PattieTool = {
  name: 'notify_owner',
  description: 'Send an important notification to the patent owner',
  parameters: {
    subject: { type: 'string', description: 'Notification subject', required: true },
    body: { type: 'string', description: 'Notification body', required: true },
  },
  async execute(params, context) {
    const { patentId, supabase } = context
    const subject = params.subject as string
    const body = params.body as string

    try {
      // Fetch patent + owner_id
      const { data: patent } = await supabase
        .from('patents')
        .select('owner_id')
        .eq('id', patentId)
        .single()

      if (!patent?.owner_id) {
        return { success: false, message: 'Could not find patent owner.', error: 'owner_id missing' }
      }

      // Fetch owner email
      const { data: profile } = await supabase
        .from('patent_profiles')
        .select('email')
        .eq('id', patent.owner_id)
        .single()

      const resendKey = process.env.RESEND_API_KEY
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@patentpending.app'

      if (profile?.email && resendKey) {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from: fromEmail,
          to: profile.email,
          subject,
          text: body,
        }).catch((err: unknown) => console.error('[pattie/notify_owner] email error', err))
      }

      // Log to correspondence
      await supabase.from('patent_correspondence').insert({
        patent_id: patentId,
        title: subject,
        content: body,
        type: 'ai_action',
        tags: ['pattie_action', 'notification'],
        from_party: 'Pattie',
        correspondence_date: today(),
      })

      return { success: true, message: 'Owner notified.' }
    } catch (err) {
      console.error('[pattie/notify_owner]', err)
      return { success: false, message: 'Failed to notify owner.', error: String(err) }
    }
  },
}

// ── Tool: generate_ids_draft ───────────────────────────────────────────────────

const generateIdsDraft: PattieTool = {
  name: 'generate_ids_draft',
  description: 'Generate a draft Information Disclosure Statement from existing prior art research candidates',
  parameters: {
    include_all: {
      type: 'boolean',
      description: 'Include all non-rejected candidates (default: true)',
      required: false,
    },
  },
  async execute(params, context) {
    const { patentId, supabase } = context

    try {
      // Fetch patent title
      const { data: patent } = await supabase
        .from('patents')
        .select('title')
        .eq('id', patentId)
        .single()

      // Fetch prior art candidates
      const { data: candidates, error: candErr } = await supabase
        .from('research_ids_candidates')
        .select('application_number, title, relevance_notes, status, relevance_score')
        .eq('patent_id', patentId)
        .neq('status', 'rejected')
        .order('relevance_score', { ascending: false })

      if (candErr) {
        return { success: false, message: 'Failed to fetch prior art candidates.', error: candErr.message }
      }

      if (!candidates || candidates.length === 0) {
        return {
          success: true,
          message: 'No prior art candidates found yet. Run a research sweep first.',
          data: { count: 0 },
        }
      }

      const count = candidates.length
      const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

      const referenceLines = candidates.map((c, i) => {
        const ref = c.application_number ?? c.title ?? `Reference ${i + 1}`
        const relevance = c.relevance_notes ?? 'See search results'
        return `Reference ${i + 1}: ${ref}\nRelevance: ${relevance}\nStatus: ${c.status ?? 'pending'}`
      }).join('\n\n')

      const draft_text = `INFORMATION DISCLOSURE STATEMENT
Patent Application: ${patent?.title ?? patentId}
Prepared by PatentPending AI | ${dateStr}

PRIOR ART REFERENCES:

${referenceLines}`

      // Save to correspondence
      await supabase.from('patent_correspondence').insert({
        patent_id: patentId,
        title: `IDS Draft — ${count} references`,
        content: draft_text,
        type: 'ai_action',
        tags: ['pattie_action', 'ids_draft'],
        from_party: 'Pattie',
        correspondence_date: today(),
      })

      return {
        success: true,
        message: `IDS draft generated from ${count} prior art candidates.`,
        data: { draft: draft_text, count },
      }
    } catch (err) {
      console.error('[pattie/generate_ids_draft]', err)
      return { success: false, message: 'Failed to generate IDS draft.', error: String(err) }
    }
  },
}

// ── Master tool list ───────────────────────────────────────────────────────────

export const PATTIE_TOOLS: PattieTool[] = [
  createSigningRequest,
  sendReminder,
  createCorrespondence,
  flagForReview,
  notifyOwner,
  generateIdsDraft,
]

// ── Executor ───────────────────────────────────────────────────────────────────

export async function executePattieTools(
  name: PattieToolName,
  params: Record<string, unknown>,
  context: PattieActionContext
): Promise<PattieToolResult> {
  const tool = PATTIE_TOOLS.find(t => t.name === name)
  if (!tool) {
    return { success: false, message: `Unknown tool: ${name}`, error: 'TOOL_NOT_FOUND' }
  }
  return tool.execute(params, context)
}

// ── Anthropic tool format export ───────────────────────────────────────────────

export function toAnthropicTools(tools: PattieTool[]) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(t.parameters).map(([k, v]) => [k, {
          type: v.type,
          description: v.description,
          ...(v.enum ? { enum: v.enum } : {}),
        }])
      ),
      required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
    },
  }))
}
