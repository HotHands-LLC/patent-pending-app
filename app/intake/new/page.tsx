'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SmartHandoffModal, { type ExtractedFields } from '@/components/SmartHandoffModal'
import { USPTO_FEES } from '@/lib/uspto-fees'

// ── Types ─────────────────────────────────────────────────────────────────────
interface IntakeSession {
  id: string
  step: number
  confidentiality_accepted: boolean
  confidentiality_accepted_at: string | null
  invention_name: string | null
  problem_solved: string | null
  how_it_works: string | null
  what_makes_it_new: string | null
  inventor_name: string | null
  inventor_email: string | null
  co_inventors: string[]
  micro_entity_eligible: boolean | null
  status: string
}

// ── CONFIDENTIALITY TEXT ──────────────────────────────────────────────────────
// ⚠️ DRAFT — PENDING CHAD REVIEW. Do not ship to public users until approved.
const CONFIDENTIALITY_TEXT = {
  heading: 'Your Invention Is Protected',
  subheading: 'Read this before we begin.',
  body: [
    {
      icon: '🔒',
      title: 'Your invention description is encrypted and private.',
      detail: 'Everything you enter is stored encrypted and is accessible only by you and authorized PatentPending systems. We do not share, sell, license, or disclose your invention to any third party.'
    },
    {
      icon: '🚫',
      title: 'Your data is never used to train AI models.',
      detail: 'Your invention description, claims, and documents are not used to train, fine-tune, or improve any AI system — ours or anyone else\'s.'
    },
    {
      icon: '📋',
      title: 'This is a confidential business relationship.',
      detail: 'By using PatentPending.app, we maintain your invention data in confidence and limit internal access to what is necessary to provide the service.'
    },
    {
      icon: '⚖️',
      title: 'This does not constitute legal advice.',
      detail: 'PatentPending.app provides AI-assisted drafting tools and filing guidance. We are not a law firm and no attorney-client relationship is created. For complex IP matters, consult a registered patent attorney.'
    },
  ],
  acknowledgment: 'I understand that my invention information will be kept confidential, that it will not be shared with third parties or used to train AI models, and that this service does not constitute legal advice.',
  version: 'v1.1'
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: '#09090b', color: '#f4f4f5', fontFamily: 'inherit' } as React.CSSProperties,
  card: { maxWidth: 640, margin: '0 auto', padding: '24px 16px' } as React.CSSProperties,
  label: { display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#71717a', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(9,9,11,0.8)', border: '1px solid #27272a', borderRadius: 8, padding: '10px 12px', color: '#f4f4f5', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const },
  textarea: { width: '100%', background: 'rgba(9,9,11,0.8)', border: '1px solid #27272a', borderRadius: 8, padding: '10px 12px', color: '#f4f4f5', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, resize: 'vertical' as const },
  hint: { fontSize: 11, color: '#52525b', marginTop: 5 },
  error: { background: 'rgba(69,10,10,0.5)', border: '1px solid rgba(153,27,27,0.5)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginBottom: 16 },
  btn: { width: '100%', padding: '12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '0.03em', transition: 'all 0.15s' } as React.CSSProperties,
  btnSecondary: { padding: '10px 20px', borderRadius: 8, border: '1px solid #27272a', cursor: 'pointer', background: 'transparent', color: '#a1a1aa', fontSize: 13, fontWeight: 600, transition: 'all 0.15s' } as React.CSSProperties,
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ['Confidentiality', 'Your Invention', 'Inventor Info', 'Summary']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {labels.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: done ? '#059669' : active ? '#f59e0b' : '#18181b',
                border: done ? 'none' : active ? '2px solid #f59e0b' : '2px solid #27272a',
                color: done ? '#fff' : active ? '#fff' : '#52525b',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: active ? '#f4f4f5' : done ? '#34d399' : '#3f3f46', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? '#059669' : '#27272a', margin: '0 4px', marginBottom: 16 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Confidentiality ───────────────────────────────────────────────────
function ConfidentialityStep({ onAccept, saving }: { onAccept: () => void; saving: boolean }) {
  const [checked, setChecked] = useState(false)

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>
        {CONFIDENTIALITY_TEXT.heading}
      </h1>
      <p style={{ fontSize: 14, color: '#71717a', marginBottom: 28 }}>
        {CONFIDENTIALITY_TEXT.subheading}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {CONFIDENTIALITY_TEXT.body.map((item, i) => (
          <div key={i} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.6 }}>{item.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Acknowledgment checkbox */}
      <div
        onClick={() => setChecked(!checked)}
        style={{
          background: checked ? 'rgba(5,150,105,0.15)' : '#18181b',
          border: checked ? '1px solid rgba(5,150,105,0.5)' : '1px solid #27272a',
          borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
          display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20,
          transition: 'all 0.15s',
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
          background: checked ? '#059669' : 'transparent',
          border: checked ? 'none' : '2px solid #3f3f46',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
        </div>
        <p style={{ fontSize: 13, color: checked ? '#d4d4d8' : '#71717a', lineHeight: 1.5, margin: 0 }}>
          {CONFIDENTIALITY_TEXT.acknowledgment}
        </p>
      </div>

      {/* Print/save link */}
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#52525b', textDecoration: 'underline' }}
        >
          🖨️ Print or save a copy of this statement
        </button>
      </div>

      <button
        onClick={onAccept}
        disabled={!checked || saving}
        style={{ ...S.btn, opacity: (!checked || saving) ? 0.4 : 1 }}
      >
        {saving ? 'Saving…' : 'I Agree — Start My Patent Intake →'}
      </button>

      <p style={{ fontSize: 11, color: '#3f3f46', textAlign: 'center', marginTop: 12 }}>
        {CONFIDENTIALITY_TEXT.version}
      </p>
    </div>
  )
}

// ── Static clarification nudge logic (Step 5) ────────────────────────────────
// No AI call — pure static rules. Future: conversational clarification.
const VAGUE_PATTERNS = [
  /^(it|this|the thing|my idea|something|a device|an app|a system)\s*$/i,
  /^(good|better|improved|new|novel|innovative)\s*$/i,
  /^n\/a$/i,
  /^(yes|no|idk|not sure|tbd|todo|later|none)\s*$/i,
]

function getNudge(key: string, value: string): string | null {
  if (!value || value.trim().length === 0) return null
  const v = value.trim()
  if (v.length < 20) return 'Too brief — add more detail so we can draft strong claims.'
  if (VAGUE_PATTERNS.some(p => p.test(v))) return 'This looks vague. Describe it in plain words — more detail = stronger patent.'
  if (key === 'problem_solved' && !v.includes(' ') && v.split(' ').length < 5) {
    return 'Describe the real-world frustration or gap this solves.'
  }
  if (key === 'what_makes_it_new' && v.length < 40) {
    return 'Novelty is the core of your patent. What have you never seen anywhere else?'
  }
  return null
}

// ── Step 2: Invention Description ─────────────────────────────────────────────
function DescriptionStep({
  data, onChange, onNext, onBack, saving, onOpenSmartHandoff
}: {
  data: Partial<IntakeSession>
  onChange: (k: string, v: string) => void
  onNext: () => void
  onBack: () => void
  saving: boolean
  onOpenSmartHandoff: () => void
}) {
  const [error, setError] = useState('')

  const questions = [
    {
      key: 'invention_name',
      label: 'What is the name of your invention?',
      hint: 'A short working title — it doesn\'t have to be final.',
      placeholder: 'e.g. Smart Traffic Stop Communication System',
      type: 'input',
      required: true,
    },
    {
      key: 'problem_solved',
      label: 'What problem does your invention solve?',
      hint: 'Describe the situation or frustration your invention addresses. Be specific.',
      placeholder: 'e.g. During traffic stops, there is no standardized way for drivers and officers to communicate safely without physical contact or ambiguity...',
      type: 'textarea',
      required: true,
    },
    {
      key: 'how_it_works',
      label: 'How does it work? Walk us through the key steps.',
      hint: 'You don\'t need technical jargon — describe it like you\'re explaining to a friend.',
      placeholder: 'e.g. The driver scans a QR code on the officer\'s vehicle. This opens a secure communication channel on their phone. Both parties can exchange messages and documents...',
      type: 'textarea',
      required: true,
    },
    {
      key: 'what_makes_it_new',
      label: 'What makes your invention new or different from anything that exists today?',
      hint: 'Think about what you\'ve never seen anywhere else. Even partial novelty counts.',
      placeholder: 'e.g. No existing product combines real-time ID verification, encrypted communication, and automatic video recording in a single QR scan initiated by the driver...',
      type: 'textarea',
      required: true,
    },
  ]

  function validate() {
    for (const q of questions) {
      if (q.required && !data[q.key as keyof IntakeSession]) {
        setError(`Please answer: "${q.label}"`)
        return false
      }
    }
    setError('')
    return true
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>
        Describe Your Invention
      </h1>
      <p style={{ fontSize: 14, color: '#71717a', marginBottom: 20 }}>
        Answer in your own words — no legal language needed. We'll help shape it into patent language.
      </p>

      {/* Smart Handoff fast-track button */}
      <button
        onClick={onOpenSmartHandoff}
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 10,
          border: '1px solid rgba(245,158,11,0.4)',
          background: 'rgba(245,158,11,0.07)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
          transition: 'all 0.15s',
          textAlign: 'left',
        } as React.CSSProperties}
      >
        <span style={{ fontSize: 22, flexShrink: 0 }}>⚡</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
            I already have research — fast track it →
          </div>
          <div style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>
            Upload PDFs, docs, images, or notes and we'll fill in the form automatically
          </div>
        </div>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {questions.map((q) => (
          <div key={q.key}>
            <label style={S.label}>{q.label} {q.required && <span style={{ color: '#f59e0b' }}>*</span>}</label>
            {q.type === 'input' ? (
              <input
                value={(data[q.key as keyof IntakeSession] as string) || ''}
                onChange={(e) => onChange(q.key, e.target.value)}
                placeholder={q.placeholder}
                style={S.input}
              />
            ) : (
              <textarea
                value={(data[q.key as keyof IntakeSession] as string) || ''}
                onChange={(e) => onChange(q.key, e.target.value)}
                placeholder={q.placeholder}
                rows={4}
                style={S.textarea}
              />
            )}
            {/* Static clarification nudge */}
            {(() => {
              const nudge = getNudge(q.key, (data[q.key as keyof IntakeSession] as string) || '')
              return nudge ? (
                <div style={{ marginTop: 5, padding: '6px 10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, fontSize: 11, color: '#fbbf24', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0 }}>💡</span>
                  <span>{nudge}</span>
                </div>
              ) : null
            })()}
            <div style={S.hint}>{q.hint}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ ...S.error, marginTop: 20 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <button onClick={onBack} style={S.btnSecondary}>← Back</button>
        <button
          onClick={() => { if (validate()) onNext() }}
          disabled={saving}
          style={{ ...S.btn, flex: 1 }}
        >
          {saving ? 'Saving…' : 'Continue to Inventor Info →'}
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Inventor Info ──────────────────────────────────────────────────────
function InventorStep({
  data, onChange, onNext, onBack, saving
}: {
  data: Partial<IntakeSession>
  onChange: (k: string, v: string | boolean | string[]) => void
  onNext: () => void
  onBack: () => void
  saving: boolean
}) {
  const [coInvStr, setCoInvStr] = useState((data.co_inventors || []).join(', '))
  const [error, setError] = useState('')

  function validate() {
    if (!data.inventor_name) { setError('Inventor name is required.'); return false }
    setError('')
    return true
  }

  function handleCoInv(v: string) {
    setCoInvStr(v)
    onChange('co_inventors', v.split(',').map(s => s.trim()).filter(Boolean))
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>
        Inventor Information
      </h1>
      <p style={{ fontSize: 14, color: '#71717a', marginBottom: 28 }}>
        This will appear on your USPTO filing. It must be accurate.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={S.label}>Full legal name <span style={{ color: '#f59e0b' }}>*</span></label>
          <input
            value={data.inventor_name || ''}
            onChange={(e) => onChange('inventor_name', e.target.value)}
            placeholder="Chad Len Bostwick"
            style={S.input}
          />
          <div style={S.hint}>Use your full legal name exactly as it appears on government ID.</div>
        </div>

        <div>
          <label style={S.label}>Email address</label>
          <input
            type="email"
            value={data.inventor_email || ''}
            onChange={(e) => onChange('inventor_email', e.target.value)}
            placeholder="you@example.com"
            style={S.input}
          />
        </div>

        <div>
          <label style={S.label}>Co-inventors (if any)</label>
          <input
            value={coInvStr}
            onChange={(e) => handleCoInv(e.target.value)}
            placeholder="Jane Smith, Robert Jones (comma-separated, or leave blank)"
            style={S.input}
          />
          <div style={S.hint}>Only list people who genuinely contributed to the inventive concept — not investors or employees who only built it.</div>
        </div>

        {/* Micro entity eligibility */}
        <div>
          <label style={S.label}>Micro entity eligibility</label>
          <p style={{ fontSize: 12, color: '#71717a', marginBottom: 12, lineHeight: 1.6 }}>
            Micro entity status reduces USPTO filing fees by ~60%. You likely qualify if:
            your gross income is under $239,000/year, you have filed fewer than 4 prior patents,
            and your employer is not a large corporation.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { val: true, label: 'Yes — I likely qualify', sub: `$${USPTO_FEES.provisional.micro} filing fee` },
              { val: false, label: 'No or unsure', sub: `$${USPTO_FEES.provisional.small} small / $${USPTO_FEES.provisional.large} large` },
            ].map(({ val, label, sub }) => (
              <button
                key={String(val)}
                onClick={() => onChange('micro_entity_eligible', val)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer',
                  background: data.micro_entity_eligible === val
                    ? (val ? 'rgba(5,150,105,0.25)' : 'rgba(146,64,14,0.25)')
                    : '#18181b',
                  border: data.micro_entity_eligible === val
                    ? (val ? '1px solid rgba(5,150,105,0.5)' : '1px solid rgba(251,191,36,0.4)')
                    : '1px solid #27272a',
                  transition: 'all 0.15s',
                } as React.CSSProperties}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: data.micro_entity_eligible === val ? '#f4f4f5' : '#71717a', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 11, color: data.micro_entity_eligible === val ? '#a1a1aa' : '#3f3f46' }}>{sub}</div>
              </button>
            ))}
          </div>
          <div style={S.hint}>Eligibility will be confirmed during the claims phase.</div>
        </div>
      </div>

      {error && <div style={{ ...S.error, marginTop: 20 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <button onClick={onBack} style={S.btnSecondary}>← Back</button>
        <button
          onClick={() => { if (validate()) onNext() }}
          disabled={saving}
          style={{ ...S.btn, flex: 1 }}
        >
          {saving ? 'Saving…' : 'Review Summary →'}
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Summary ───────────────────────────────────────────────────────────
function SummaryStep({
  data, sessionId, onBack, onSubmit, saving
}: {
  data: Partial<IntakeSession>
  sessionId: string | null
  onBack: () => void
  onSubmit: () => void
  saving: boolean
}) {
  const sections = [
    {
      title: 'Your Invention',
      rows: [
        { label: 'Name', value: data.invention_name },
        { label: 'Problem it solves', value: data.problem_solved },
        { label: 'How it works', value: data.how_it_works },
        { label: 'What makes it new', value: data.what_makes_it_new },
      ]
    },
    {
      title: 'Inventor',
      rows: [
        { label: 'Name', value: data.inventor_name },
        { label: 'Email', value: data.inventor_email || '—' },
        { label: 'Co-inventors', value: (data.co_inventors || []).length > 0 ? (data.co_inventors || []).join(', ') : 'None' },
        { label: 'Micro entity', value: data.micro_entity_eligible === true ? `Likely yes ($${USPTO_FEES.provisional.micro} fee)` : data.micro_entity_eligible === false ? 'No / unsure' : 'Not answered' },
      ]
    }
  ]

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>
        Review Your Intake
      </h1>
      <p style={{ fontSize: 14, color: '#71717a', marginBottom: 28 }}>
        Review your submission before proceeding to payment.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
        {sections.map((section) => (
          <div key={section.title} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #27272a', background: '#09090b' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#71717a' }}>{section.title}</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {section.rows.map((row) => row.value && (
                <div key={row.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#52525b', marginBottom: 3 }}>{row.label}</div>
                  <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.6 }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA — pay gate */}
      <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 12, padding: '20px', marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 18, marginBottom: 8 }}>🚀</div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>Ready to draft your patent claims?</h3>
        <p style={{ fontSize: 13, color: '#71717a', marginBottom: 4, lineHeight: 1.5 }}>
          We'll generate a full claims draft, spec outline, and USPTO filing package.
        </p>
        <p style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700, marginBottom: 16 }}>One-time fee — no subscription.</p>
        <button
          onClick={onSubmit}
          disabled={saving || !sessionId}
          style={{ ...S.btn, background: '#f5a623', color: '#1a1f36', width: 'auto', padding: '12px 32px' }}
        >
          {saving ? 'Redirecting to payment…' : 'Draft My Claims — $49 →'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onBack} style={S.btnSecondary}>← Edit</button>
        <div style={{ flex: 1 }} />
        <Link href="/dashboard" style={{ fontSize: 12, color: '#52525b', display: 'flex', alignItems: 'center' }}>
          Save and finish later →
        </Link>
      </div>
    </div>
  )
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, maxWidth: 480, width: 'calc(100% - 32px)',
      background: 'rgba(5,150,105,0.95)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(52,211,153,0.4)',
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>✅</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 16, flexShrink: 0 }}>✕</button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntakeNewPage() {
  const router = useRouter()
  const [session, setSession] = useState<Partial<IntakeSession> | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [showSmartHandoff, setShowSmartHandoff] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Auth check + load or create session
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Capture access token for Smart Handoff upload
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (authSession?.access_token) setAuthToken(authSession.access_token)

      // Look for existing draft session
      const { data: existing } = await supabase
        .from('patent_intake_sessions')
        .select('*')
        .eq('owner_id', user.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existing) {
        setSession(existing)
        setSessionId(existing.id)
        setStep(existing.step || 1)
      } else {
        // Create new session
        const { data: created, error: err } = await supabase
          .from('patent_intake_sessions')
          .insert({ owner_id: user.id, step: 1 })
          .select()
          .single()
        if (err) { setError(err.message); setLoading(false); return }
        setSession(created)
        setSessionId(created.id)
      }
      setLoading(false)
    }
    init()
  }, [router])

  async function saveSession(updates: Partial<IntakeSession>) {
    if (!sessionId) return
    const merged = { ...session, ...updates }
    setSession(merged)
    await supabase
      .from('patent_intake_sessions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  function handleChange(k: string, v: string | boolean | string[]) {
    setSession(prev => ({ ...prev, [k]: v }))
  }

  async function handleConfidentialityAccept() {
    setSaving(true)
    await saveSession({
      confidentiality_accepted: true,
      confidentiality_accepted_at: new Date().toISOString(),
      step: 2,
    })
    setStep(2)
    setSaving(false)
  }

  async function handleDescriptionNext() {
    setSaving(true)
    await saveSession({
      invention_name: session?.invention_name || null,
      problem_solved: session?.problem_solved || null,
      how_it_works: session?.how_it_works || null,
      what_makes_it_new: session?.what_makes_it_new || null,
      step: 3,
    })
    setStep(3)
    setSaving(false)
  }

  async function handleInventorNext() {
    setSaving(true)
    await saveSession({
      inventor_name: session?.inventor_name || null,
      inventor_email: session?.inventor_email || null,
      co_inventors: session?.co_inventors || [],
      micro_entity_eligible: session?.micro_entity_eligible ?? null,
      step: 4,
    })
    setStep(4)
    setSaving(false)
  }

  function handleSmartHandoffSuccess(extracted: ExtractedFields) {
    // Map extracted fields → intake session fields
    const updates: Partial<IntakeSession> = {}
    if (extracted.title) updates.invention_name = extracted.title
    if (extracted.problem_solved) updates.problem_solved = extracted.problem_solved
    if (extracted.description) updates.how_it_works = extracted.description
    if (extracted.key_features?.length) {
      updates.what_makes_it_new = extracted.key_features.map(f => `• ${f}`).join('\n')
    }
    // Apply to local state immediately
    setSession(prev => ({ ...prev, ...updates }))
    // Persist to DB
    if (sessionId) {
      supabase
        .from('patent_intake_sessions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .then()
    }
    setShowSmartHandoff(false)
    setToast('We filled in your application from your documents. Review and continue.')
  }

  async function handleFinalSubmit() {
    setSaving(true)
    await saveSession({ status: 'summary_viewed', step: 4 })
    // Initiate Stripe Checkout
    const { data: { session: authSession } } = await supabase.auth.getSession()
    const token = authSession?.access_token
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ intake_session_id: sessionId }),
    })
    const json = await res.json()
    if (json.url) {
      window.location.href = json.url
    } else {
      setError(json.error || 'Checkout failed — please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#52525b', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={S.error}>{error}</div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid #18181b', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/dashboard" style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5', textDecoration: 'none' }}>
          ⚖️ PatentPending
        </Link>
        <span style={{ fontSize: 11, color: '#52525b' }}>Free Intake — Step {step} of 4</span>
      </div>

      <div style={S.card}>
        <StepIndicator current={step} total={4} />

        {step === 1 && (
          <ConfidentialityStep onAccept={handleConfidentialityAccept} saving={saving} />
        )}
        {step === 2 && (
          <DescriptionStep
            data={session || {}}
            onChange={handleChange}
            onNext={handleDescriptionNext}
            onBack={() => setStep(1)}
            saving={saving}
            onOpenSmartHandoff={() => setShowSmartHandoff(true)}
          />
        )}
        {step === 3 && (
          <InventorStep
            data={session || {}}
            onChange={handleChange}
            onNext={handleInventorNext}
            onBack={() => setStep(2)}
            saving={saving}
          />
        )}
        {step === 4 && (
          <SummaryStep
            data={session || {}}
            sessionId={sessionId}
            onBack={() => setStep(3)}
            onSubmit={handleFinalSubmit}
            saving={saving}
          />
        )}
      </div>

      {/* Smart Handoff Modal */}
      {showSmartHandoff && sessionId && authToken && (
        <SmartHandoffModal
          intakeSessionId={sessionId}
          authToken={authToken}
          onSuccess={handleSmartHandoffSuccess}
          onClose={() => setShowSmartHandoff(false)}
        />
      )}

      {/* Success toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
