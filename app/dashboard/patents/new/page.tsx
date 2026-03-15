'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

// ── Interview questions ────────────────────────────────────────────────────────
interface Question { id: string; label: string; hint?: string; placeholder: string; required: boolean; isFigures?: boolean }

const QUESTIONS: Question[] = [
  {
    id: 'what_it_does',
    label: 'What does your invention do?',
    hint: 'Describe it like you\'re explaining to a friend.',
    placeholder: 'My invention is a device/system/method that...',
    required: true,
  },
  {
    id: 'problem_solved',
    label: 'What problem does it solve?',
    hint: 'What was frustrating or broken before your idea?',
    placeholder: 'Before my invention, people struggled with...',
    required: true,
  },
  {
    id: 'how_it_works',
    label: 'How does it work?',
    hint: 'Walk me through the key steps or components.',
    placeholder: 'The key components are... First, it... Then...',
    required: true,
  },
  {
    id: 'what_makes_different',
    label: 'What makes it different?',
    hint: 'What makes it different from anything already out there?',
    placeholder: 'Unlike existing solutions, my invention...',
    required: true,
  },
  {
    id: 'inventors',
    label: 'Who invented this?',
    hint: 'Just you, or did others contribute?',
    placeholder: 'Just me — Chad Bostwick / Me and Jane Smith',
    required: true,
  },
  {
    id: 'has_figures',
    label: 'Do you have sketches or diagrams?',
    hint: 'Photos, drawings, or diagrams of your invention (optional — you can add these later)',
    placeholder: '',
    required: false,
    isFigures: true,
  },
] as const

type Answers = { what_it_does?: string; problem_solved?: string; how_it_works?: string; what_makes_different?: string; inventors?: string; has_figures?: boolean }
type Mode = 'choose' | 'interview' | 'drafting' | 'form'

function PattieAvatar({ size = 36 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%', background: '#4f46e5',
      color: '#fff', fontSize: Math.round(size * 0.38), fontWeight: 800,
      letterSpacing: '-0.5px', flexShrink: 0, userSelect: 'none',
    }}>PP</span>
  )
}

function NewPatentPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Support ?mode=interview from intent screen
  const initialMode = searchParams.get('mode') === 'interview' ? 'interview' : 'choose'
  const [mode, setMode]               = useState<Mode>(initialMode)
  const [isPro, setIsPro]             = useState<boolean | null>(null)
  const [authToken, setAuthToken]     = useState('')
  const [step, setStep]               = useState(0)
  const [answers, setAnswers]         = useState<Answers>({})
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [hasFigures, setHasFigures]   = useState(false)
  const [draftError, setDraftError]   = useState('')
  const [saving, setSaving]           = useState(false)

  // Form mode state
  const [form, setForm] = useState({
    title: '', description: '', inventors: '', provisional_number: '',
    application_number: '', filing_date: '', provisional_deadline: '',
    status: 'provisional', tags: '',
  })
  const [formSaving, setFormSaving]   = useState(false)
  const [formError, setFormError]     = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setAuthToken(session.access_token)
      // Check tier
      fetch('/api/budget/check', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
        .then(r => r.ok ? setIsPro(true) : setIsPro(false))
        .catch(() => setIsPro(false))
    })
  }, [router])

  // ── Form deadline auto-calc ─────────────────────────────────────────────────
  function handleFilingDateChange(date: string) {
    const dl = date ? new Date(date + 'T00:00:00') : null
    if (dl) { dl.setFullYear(dl.getFullYear() + 1); setForm(f => ({ ...f, filing_date: date, provisional_deadline: dl.toISOString().split('T')[0] })) }
    else setForm(f => ({ ...f, filing_date: date }))
  }

  // ── Interview navigation ───────────────────────────────────────────────────
  function goNext() {
    const q = QUESTIONS[step]
    if (q.isFigures) {
      setAnswers(a => ({ ...a, has_figures: hasFigures } as Answers))
    } else {
      if (q.required && !currentAnswer.trim()) return
      setAnswers(a => ({ ...a, [q.id as string]: currentAnswer } as Answers))
    }
    if (step < QUESTIONS.length - 1) {
      setStep(s => s + 1)
      const nextId = QUESTIONS[step + 1].id
      setCurrentAnswer((answers as Record<string, string>)[nextId] ?? '')
    } else {
      submitInterview()
    }
  }

  function goBack() {
    if (step === 0) { setMode('choose'); return }
    const prevId = QUESTIONS[step - 1].id
    setCurrentAnswer((answers as Record<string, string>)[prevId] ?? '')
    setStep(s => s - 1)
  }

  function skip() {
    if (step < QUESTIONS.length - 1) { setStep(s => s + 1); setCurrentAnswer('') }
    else submitInterview()
  }

  async function submitInterview() {
    const finalAnswers: Answers = {
      ...answers,
      ...(QUESTIONS[step].isFigures ? { has_figures: hasFigures } : { [QUESTIONS[step].id]: currentAnswer }),
    }
    setMode('drafting')
    setDraftError('')
    try {
      const res = await fetch('/api/pattie/interview-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ answers: {
          what_it_does:        finalAnswers.what_it_does ?? '',
          problem_solved:      finalAnswers.problem_solved ?? '',
          how_it_works:        finalAnswers.how_it_works ?? '',
          what_makes_different: finalAnswers.what_makes_different ?? '',
          inventors:           finalAnswers.inventors ?? '',
          has_figures:         !!finalAnswers.has_figures,
        }}),
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error ?? 'Draft failed')
      router.push(`/dashboard/patents/${d.patent_id}?pattie_drafted=1`)
    } catch (e) {
      setDraftError((e as Error).message)
      setMode('interview')
    }
  }

  // ── Form submit ───────────────────────────────────────────────────────────
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormSaving(true); setFormError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data, error: err } = await supabase.from('patents').insert({
      owner_id: user.id, title: form.title,
      description: form.description || null,
      inventors: form.inventors ? form.inventors.split(',').map(s => s.trim()).filter(Boolean) : [],
      provisional_number: form.provisional_number || null,
      application_number: form.application_number || null,
      filing_date: form.filing_date || null,
      provisional_deadline: form.provisional_deadline || null,
      status: form.status,
      tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    }).select().single()
    if (err) { setFormError(err.message); setFormSaving(false); return }
    if (data && form.provisional_deadline) {
      await supabase.from('patent_deadlines').insert({ patent_id: data.id, owner_id: user.id, deadline_type: 'non_provisional', due_date: form.provisional_deadline, notes: 'File non-provisional or PCT by this date — 12 months from provisional' })
    }
    router.push(`/dashboard/patents/${data?.id}`)
  }

  const q = QUESTIONS[step]

  // ── Choose mode ───────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#1a1f36]">Register New Patent</h1>
            <p className="text-gray-500 mt-1">Choose how you&apos;d like to get started.</p>
          </div>

          {/* Pattie option */}
          {isPro === false ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-4">
              <div className="flex items-start gap-3">
                <PattieAvatar size={40} />
                <div>
                  <h2 className="font-bold text-indigo-900 text-base">Let Pattie guide you</h2>
                  <p className="text-sm text-indigo-700 mt-1">Answer a few questions and Pattie fills in your patent draft automatically.</p>
                  <div className="mt-3 inline-flex items-center gap-2 text-xs text-indigo-600 font-medium bg-indigo-100 px-3 py-1.5 rounded-lg">
                    🔒 Requires PatentPending Pro — <a href="/pricing" className="underline hover:no-underline">Upgrade →</a>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-indigo-50 border-2 border-indigo-300 rounded-xl p-5 mb-4 hover:border-indigo-400 transition-colors">
              <div className="flex items-start gap-3">
                <PattieAvatar size={40} />
                <div className="flex-1">
                  <h2 className="font-bold text-indigo-900 text-base">🤖 Let Pattie guide you</h2>
                  <p className="text-sm text-indigo-700 mt-1 mb-3">Answer a few questions and Pattie fills in your patent draft. Takes about 2 minutes.</p>
                  <button
                    onClick={() => { setMode('interview'); setStep(0); setCurrentAnswer('') }}
                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    Start with Pattie →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="relative flex items-center py-3 mb-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="mx-4 text-xs text-gray-400 font-medium">— or fill out the form yourself —</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Patent Title *</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                placeholder="e.g. QR+ Interactive Media Platform" />
            </div>
            {/* Inventors */}
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Inventors</label>
              <input type="text" value={form.inventors} onChange={e => setForm(f => ({ ...f, inventors: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                placeholder="Chad Bostwick, Jane Smith (comma-separated)" />
            </div>
            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Filing Date</label>
                <input type="date" value={form.filing_date} onChange={e => handleFilingDateChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Provisional Deadline <span className="text-gray-400 font-normal">(auto)</span></label>
                <input type="date" value={form.provisional_deadline} onChange={e => setForm(f => ({ ...f, provisional_deadline: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36] bg-yellow-50" />
              </div>
            </div>
            {/* App numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Provisional Number</label>
                <input type="text" value={form.provisional_number} onChange={e => setForm(f => ({ ...f, provisional_number: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]" placeholder="63/791,240" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Application Number</label>
                <input type="text" value={form.application_number} onChange={e => setForm(f => ({ ...f, application_number: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]" placeholder="17/123,456" />
              </div>
            </div>
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]">
                {['provisional','non_provisional','published','granted','abandoned'].map(s => (
                  <option key={s} value={s}>{s.replace('_',' ')}</option>
                ))}
              </select>
            </div>
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                placeholder="Brief description of the invention..." />
            </div>
            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-[#1a1f36] mb-1.5">Tags</label>
              <input type="text" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1f36]"
                placeholder="ai, mobile, saas (comma-separated)" />
            </div>
            {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={formSaving}
                className="px-6 py-2.5 bg-[#1a1f36] text-white rounded-lg font-medium text-sm hover:bg-[#2d3561] transition-colors disabled:opacity-50">
                {formSaving ? 'Registering...' : 'Register Patent'}
              </button>
              <button type="button" onClick={() => router.back()}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ── Drafting state ────────────────────────────────────────────────────────
  if (mode === 'drafting') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <PattieAvatar size={56} />
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-base font-semibold text-[#1a1f36]">Pattie is drafting your patent…</span>
          </div>
          <p className="text-sm text-gray-500 mt-2">This takes about 15–20 seconds.</p>
          {draftError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {draftError} — <button onClick={() => setMode('interview')} className="underline">Go back</button> or <button onClick={() => setMode('choose')} className="underline">use the form</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Interview mode ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <PattieAvatar size={28} />
            <span className="font-semibold text-[#1a1f36] text-sm">Pattie Interview</span>
          </div>
          <button onClick={() => setMode('choose')} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Switch to form
          </button>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Question {step + 1} of {QUESTIONS.length}</span>
            <span>{Math.round(((step) / QUESTIONS.length) * 100)}% done</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${((step) / QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-5">
            <PattieAvatar size={32} />
            <div>
              <p className="font-semibold text-[#1a1f36] text-base leading-snug">{q.label}</p>
              {q.hint && <p className="text-sm text-gray-400 mt-1">{q.hint}</p>}
            </div>
          </div>

          {q.isFigures ? (
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                <input type="radio" name="figures" checked={!hasFigures} onChange={() => setHasFigures(false)}
                  className="w-4 h-4 text-indigo-600" />
                <span className="text-sm text-gray-700">No — I&apos;ll add them later</span>
              </label>
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                <input type="radio" name="figures" checked={hasFigures} onChange={() => setHasFigures(true)}
                  className="w-4 h-4 text-indigo-600" />
                <span className="text-sm text-gray-700">Yes — I have sketches / photos to add</span>
              </label>
            </div>
          ) : (
            <textarea
              value={currentAnswer}
              onChange={e => setCurrentAnswer(e.target.value)}
              placeholder={q.placeholder}
              rows={5}
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); goNext() }
              }}
            />
          )}

          {draftError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ⚠️ {draftError} — try again or <button onClick={() => setMode('choose')} className="underline">switch to the form</button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={goBack}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            ← Back
          </button>

          <div className="flex items-center gap-2">
            {!q.required && (
              <button
                onClick={skip}
                className="text-sm text-gray-400 hover:text-gray-600 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={goNext}
              disabled={q.required && !q.isFigures && !currentAnswer.trim()}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === QUESTIONS.length - 1 ? 'Build my draft →' : 'Next →'}
            </button>
          </div>
        </div>

        {/* Cmd+Enter hint */}
        {!q.isFigures && (
          <p className="text-center text-xs text-gray-300 mt-3">⌘↵ to continue</p>
        )}
      </div>
    </div>
  )
}

export default function NewPatentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <NewPatentPageInner />
    </Suspense>
  )
}