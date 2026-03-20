'use client'
import { useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { createClient } from '@supabase/supabase-js'
import { CloudUpload, MessageSquare, Zap, X, ArrowLeft, Mic, MicOff } from 'lucide-react'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
  )
}

type Screen = 'choose' | 'upload' | 'describe' | 'quickstart'

function NewPatentPageInner() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('choose')

  // ── Upload state ──────────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [googleDocUrl, setGoogleDocUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Describe state ────────────────────────────────────────────────────────
  const [inventionText, setInventionText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [creatingPatent, setCreatingPatent] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // ── Quickstart state ──────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [creatingQuick, setCreatingQuick] = useState(false)

  function resetSubScreenState() {
    setDragOver(false)
    setUploading(false)
    setUploadError(null)
    setGoogleDocUrl('')
    setInventionText('')
    setIsRecording(false)
    setCreatingPatent(false)
    setTitle('')
    setCreatingQuick(false)
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
  }

  // ── Upload handlers ───────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setUploading(true)
    setUploadError(null)

    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/patents/upload-extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error ?? 'Extraction failed. Please try again.')
        setUploading(false)
        return
      }

      const fileType = file.type.startsWith('audio') ? 'voice memo' : file.type.includes('image') ? 'sketch' : 'document'
      const pattiePrompt = `I just read your ${fileType}. Here's what I found: "${data.fields_populated?.includes('title') ? 'title extracted' : 'content extracted'}". I've pre-filled your Description, Claims, and Abstract based on what you gave me.${data.extraction_notes ? `\n\nNotes from extraction: ${data.extraction_notes}` : ''}\n\nWant me to review the claims for USPTO §101 eligibility, or is there anything you'd like to correct first?`

      router.push(`/dashboard/patents/${data.patent_id}?pattie=${encodeURIComponent(pattiePrompt)}`)
    } catch {
      setUploadError('Network error. Please try again.')
      setUploading(false)
    }
  }

  async function handleGoogleDoc() {
    if (!googleDocUrl) return
    setUploading(true)
    setUploadError(null)

    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const formData = new FormData()
    formData.append('google_doc_url', googleDocUrl)

    try {
      const res = await fetch('/api/patents/upload-extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error ?? 'Could not extract from Google Doc.')
        setUploading(false)
        return
      }

      const pattiePrompt = `I just read your Google Doc. Here's what I found: title and content extracted.${data.extraction_notes ? `\n\nNotes: ${data.extraction_notes}` : ''}\n\nI've pre-filled your patent record. Want me to review the claims for §101 eligibility, or is there anything you'd like to correct first?`
      router.push(`/dashboard/patents/${data.patent_id}?pattie=${encodeURIComponent(pattiePrompt)}`)
    } catch {
      setUploadError('Network error. Please try again.')
      setUploading(false)
    }
  }

  // ── Speech recognition ────────────────────────────────────────────────────
  function toggleRecording() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRec) return

    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRec()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognitionRef.current = recognition

    let silenceTimer: ReturnType<typeof setTimeout>

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      clearTimeout(silenceTimer)
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInventionText(prev => prev + transcript)
      silenceTimer = setTimeout(() => { recognition.stop(); setIsRecording(false) }, 5000)
    }

    recognition.onend = () => setIsRecording(false)
    recognition.onerror = () => setIsRecording(false)

    recognition.start()
    setIsRecording(true)
  }

  // ── Describe handler ──────────────────────────────────────────────────────
  async function handleDescribeContinue() {
    setCreatingPatent(true)
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await fetch('/api/patents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ title: 'Untitled Patent', lifecycle_state: 'DRAFT' }),
    })
    const data = await res.json()
    if (!res.ok) { setCreatingPatent(false); return }

    const pattiePrompt = `Here's what the inventor wrote:\n\n${inventionText}\n\nPlease introduce yourself briefly, confirm you've understood the core idea, then ask the 2–3 most important follow-up questions needed to draft a strong provisional patent. Ask them one at a time in a natural conversation — do not present a list.`

    router.push(`/dashboard/patents/${data.id}?pattie=${encodeURIComponent(pattiePrompt)}`)
  }

  // ── Quick start handler ───────────────────────────────────────────────────
  async function handleQuickStart(e: React.FormEvent) {
    e.preventDefault()
    setCreatingQuick(true)
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await fetch('/api/patents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ title: title.trim(), lifecycle_state: 'DRAFT' }),
    })
    const data = await res.json()
    if (!res.ok) { setCreatingQuick(false); return }

    router.push(`/dashboard/patents/${data.id}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 pt-16 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">

          {/* Sub-screen header */}
          {screen !== 'choose' && (
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => { setScreen('choose'); resetSubScreenState() }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
          )}

          {/* ── Choose screen ─────────────────────────────────────────────── */}
          {screen === 'choose' && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Start a new patent</h1>
              <p className="text-gray-500 text-center mb-8">What do you have to work with?</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Card 1: Upload & Extract */}
                <button
                  onClick={() => setScreen('upload')}
                  className="flex flex-col items-center text-center p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
                    <CloudUpload size={22} className="text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">I have a document or file</h3>
                  <p className="text-sm text-gray-500 mb-4">PDF, Word, images, voice memos, Google Docs</p>
                  <span className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg group-hover:bg-indigo-700 transition-colors">
                    Upload &amp; Extract
                  </span>
                </button>

                {/* Card 2: Tell Pattie */}
                <button
                  onClick={() => setScreen('describe')}
                  className="flex flex-col items-center text-center p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
                    <MessageSquare size={22} className="text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">I&apos;ll describe it</h3>
                  <p className="text-sm text-gray-500 mb-4">Type or speak — Pattie will ask the right questions</p>
                  <span className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg group-hover:bg-indigo-700 transition-colors">
                    Start Talking
                  </span>
                </button>

                {/* Card 3: Quick Start */}
                <button
                  onClick={() => setScreen('quickstart')}
                  className="flex flex-col items-center text-center p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
                    <Zap size={22} className="text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Quick Start</h3>
                  <p className="text-sm text-gray-500 mb-4">Just name it and start a blank patent record</p>
                  <span className="px-4 py-2 border border-gray-300 text-gray-700 hover:border-indigo-300 hover:text-indigo-700 bg-transparent text-sm font-medium rounded-lg transition-colors">
                    Get Started
                  </span>
                </button>
              </div>
            </>
          )}

          {/* ── Upload screen ─────────────────────────────────────────────── */}
          {screen === 'upload' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Upload a document</h2>
              <p className="text-sm text-gray-500 mb-6">Pattie will extract your patent details automatically.</p>

              {uploading ? (
                <div className="flex flex-col items-center py-12">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-gray-600">Pattie is reading your file…</p>
                </div>
              ) : (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                      dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'
                    }`}
                  >
                    <CloudUpload className="mx-auto mb-3 text-gray-400" size={40} />
                    <p className="font-medium text-gray-700 mb-1">Drop your file here or click to browse</p>
                    <p className="text-xs text-gray-400">PDF, DOCX, TXT, MD, PNG, JPG, HEIC, M4A, MP3, WAV · Max 25MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.heic,.m4a,.mp3,.wav"
                      onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-gray-500 text-center mb-2">— or —</p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="Paste a Google Doc URL"
                        value={googleDocUrl}
                        onChange={(e) => setGoogleDocUrl(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => handleGoogleDoc()}
                        disabled={!googleDocUrl || uploading}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Extract
                      </button>
                    </div>
                  </div>

                  {uploadError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {uploadError}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Describe screen ───────────────────────────────────────────── */}
          {screen === 'describe' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Describe your invention</h2>
              <p className="text-sm text-gray-500 mb-6">Tell Pattie what you built — she&apos;ll ask the right follow-up questions.</p>

              <textarea
                value={inventionText}
                onChange={(e) => setInventionText(e.target.value)}
                placeholder="Describe your invention in your own words. Anything helps — rough notes, how it works, the problem it solves, what makes it different."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                style={{ minHeight: '120px' }}
                rows={5}
              />

              <div className="flex items-center justify-end mt-2">
                {typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) && (
                  <button
                    onClick={toggleRecording}
                    aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                      isRecording
                        ? 'bg-red-100 text-red-700 border border-red-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-label="Recording in progress" />
                        <MicOff size={14} /> Stop
                      </>
                    ) : (
                      <><Mic size={14} /> Speak</>
                    )}
                  </button>
                )}
              </div>

              <button
                onClick={handleDescribeContinue}
                disabled={inventionText.trim().length < 20 || creatingPatent}
                className="w-full mt-4 px-4 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creatingPatent ? 'Creating…' : 'Continue with Pattie →'}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">{inventionText.length} characters</p>
            </div>
          )}

          {/* ── Quick start screen ────────────────────────────────────────── */}
          {screen === 'quickstart' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Quick Start</h2>
              <p className="text-sm text-gray-500 mb-6">Name your patent and we&apos;ll create a blank record for you to fill in.</p>

              <form onSubmit={handleQuickStart}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Patent title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Smart Hydration Tracking Water Bottle"
                  maxLength={200}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-6"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!title.trim() || creatingQuick}
                  className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {creatingQuick ? 'Creating…' : 'Create Patent'}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

export default function NewPatentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <NewPatentPageInner />
    </Suspense>
  )
}
