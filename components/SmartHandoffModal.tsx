'use client'
import { useRef, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ExtractedFields {
  title: string | null
  description: string | null
  problem_solved: string | null
  key_features: string[]
  target_market: string | null
  prior_art_notes: string | null
  inventor_notes: string | null
}

interface AttachedFile {
  file: File
  id: string
}

interface SmartHandoffModalProps {
  intakeSessionId: string
  authToken: string
  onSuccess: (extracted: ExtractedFields) => void
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp']
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
])
const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024   // 10MB
const MAX_TOTAL_BYTES = 25 * 1024 * 1024  // 25MB

// ── File type icon ─────────────────────────────────────────────────────────────
function fileIcon(type: string): string {
  if (type === 'application/pdf') return '📄'
  if (type.includes('word') || type.includes('doc')) return '📝'
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'text/plain') return '📃'
  if (type === 'text/markdown') return '🗒️'
  return '📁'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Styles ────────────────────────────────────────────────────────────────────
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 999,
  background: 'rgba(0,0,0,0.8)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '16px',
}

const modal: React.CSSProperties = {
  background: '#18181b',
  border: '1px solid #27272a',
  borderRadius: 16,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '28px 24px',
  position: 'relative',
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function SmartHandoffModal({
  intakeSessionId,
  authToken,
  onSuccess,
  onClose,
}: SmartHandoffModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  // ── File validation ─────────────────────────────────────────────────────────
  function validateAndAdd(incoming: File[]): string | null {
    const combined = [...attachedFiles.map(a => a.file), ...incoming]
    if (combined.length > MAX_FILES) {
      return `Maximum ${MAX_FILES} files allowed.`
    }
    let total = 0
    for (const f of combined) {
      if (!ACCEPTED_MIME_TYPES.has(f.type) && !ACCEPTED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))) {
        return `Unsupported file type: ${f.name}. Use PDF, DOCX, TXT, MD, PNG, JPG, or WEBP.`
      }
      if (f.size > MAX_FILE_BYTES) {
        return `${f.name} is too large (${formatBytes(f.size)}). Max 10MB per file.`
      }
      total += f.size
    }
    if (total > MAX_TOTAL_BYTES) {
      return `Total size too large (${formatBytes(total)}). Max 25MB combined.`
    }
    return null
  }

  function addFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming)
    const err = validateAndAdd(list)
    if (err) { setError(err); return }
    setError('')
    setAttachedFiles(prev => [
      ...prev,
      ...list.map(f => ({ file: f, id: `${Date.now()}-${Math.random()}` })),
    ])
  }

  function removeFile(id: string) {
    setAttachedFiles(prev => prev.filter(a => a.id !== id))
    setError('')
  }

  // ── Drag & drop handlers ────────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(true)
  }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedFiles])

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (!attachedFiles.length) { setError('Please attach at least one file.'); return }
    setAnalyzing(true)
    setError('')

    try {
      const fd = new FormData()
      fd.append('intake_session_id', intakeSessionId)
      for (const { file } of attachedFiles) {
        fd.append('files', file)
      }

      const res = await fetch('/api/intake/analyze-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: fd,
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Analysis failed — please try again.')
        setAnalyzing(false)
        return
      }

      onSuccess(json.extracted as ExtractedFields)
    } catch {
      setError('Network error — please try again.')
      setAnalyzing(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#52525b', fontSize: 20, lineHeight: 1, padding: 4,
          }}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f59e0b', marginBottom: 8 }}>
            ⚡ SMART HANDOFF
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5', margin: '0 0 8px', lineHeight: 1.3 }}>
            Skip the blank form. Upload what you've already built.
          </h2>
          <p style={{ fontSize: 13, color: '#71717a', margin: 0, lineHeight: 1.6 }}>
            Drop in your ChatGPT exports, PDFs, images, sketches, or notes. Our AI will read everything and fill in your application automatically.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !analyzing && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#f59e0b' : '#3f3f46'}`,
            borderRadius: 12,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: analyzing ? 'default' : 'pointer',
            background: dragging ? 'rgba(245,158,11,0.05)' : 'rgba(9,9,11,0.6)',
            transition: 'all 0.15s',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#a1a1aa', margin: '0 0 4px' }}>
            {dragging ? 'Drop files here' : 'Drag & drop or click to browse'}
          </p>
          <p style={{ fontSize: 11, color: '#52525b', margin: 0 }}>
            {ACCEPTED_EXTENSIONS.join('  ·  ')} &nbsp;·&nbsp; Max {MAX_FILES} files, 10MB each, 25MB total
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        {/* Attached files list */}
        {attachedFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {attachedFiles.map(({ file, id }) => (
              <div
                key={id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#09090b',
                  border: '1px solid #27272a',
                  borderRadius: 8, padding: '8px 12px',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(file.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#d4d4d8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#52525b' }}>{formatBytes(file.size)}</div>
                </div>
                <button
                  onClick={() => removeFile(id)}
                  disabled={analyzing}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#52525b', fontSize: 16, padding: 4, flexShrink: 0,
                    opacity: analyzing ? 0.4 : 1,
                  }}
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(69,10,10,0.5)', border: '1px solid rgba(153,27,27,0.5)',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5',
            marginBottom: 16,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleAnalyze}
          disabled={analyzing || !attachedFiles.length}
          style={{
            width: '100%', padding: '14px',
            borderRadius: 8, border: 'none', cursor: (analyzing || !attachedFiles.length) ? 'not-allowed' : 'pointer',
            background: '#f59e0b', color: '#1a1a1a',
            fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
            opacity: (analyzing || !attachedFiles.length) ? 0.5 : 1,
            transition: 'all 0.15s',
          }}
        >
          {analyzing ? '🔍 Analyzing your documents…' : 'Analyze & Auto-Fill My Application →'}
        </button>

        {/* Note */}
        <p style={{ fontSize: 11, color: '#52525b', textAlign: 'center', marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
          All uploads are stored securely in your correspondence folder. Processing takes 30–60 seconds.
        </p>
      </div>
    </div>
  )
}
