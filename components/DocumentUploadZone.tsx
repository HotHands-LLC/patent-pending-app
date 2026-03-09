'use client'
import { useRef, useState, useCallback } from 'react'

type UploadType = 'spec' | 'figures'

interface UploadedFileResult {
  name: string
  outputName?: string
  size: number
  signed_url: string
  converted?: boolean
  lowContrastWarning?: boolean
}

interface UploadResult {
  files: UploadedFileResult[]
  count?: number
  convertedCount?: number
}

interface DocumentUploadZoneProps {
  type: UploadType
  patentId: string
  authToken: string
  disabled?: boolean
  disabledReason?: string
  onSuccess: (result: UploadResult) => void
}

const CONFIG: Record<UploadType, {
  label: string
  icon: string
  accept: string[]
  acceptMime: Set<string>
  maxFiles: number
  maxMB: number
  hint: string
  helperText?: string
}> = {
  spec: {
    label: 'Upload Specification Document',
    icon: '📋',
    accept: ['.pdf', '.docx', '.doc', '.md', '.txt'],
    acceptMime: new Set(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','text/plain','text/markdown']),
    maxFiles: 1,
    maxMB: 25,
    hint: 'PDF, DOCX, MD, or TXT — Background, Summary, and Detailed Description',
  },
  figures: {
    label: 'Upload Drawings / Figures',
    icon: '📐',
    accept: ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif', '.heic', '.heif', '.bmp', '.pdf'],
    acceptMime: new Set([
      'image/png','image/jpeg','image/webp','image/tiff',
      'image/heic','image/heif','image/bmp','application/pdf',
    ]),
    maxFiles: 10,
    maxMB: 10,
    hint: 'PNG, JPG, WebP, HEIC, TIFF, PDF — up to 10 files, 10MB each',
    helperText: 'Upload any image — we\'ll automatically convert it to USPTO-compliant black & white line art at 300 DPI. Hand sketches welcome.',
  },
}

function formatBytes(b: number) {
  if (b < 1024) return `${b}B`
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`
  return `${(b/1048576).toFixed(1)}MB`
}

export default function DocumentUploadZone({
  type, patentId, authToken, disabled, disabledReason, onSuccess
}: DocumentUploadZoneProps) {
  const cfg = CONFIG[type]
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<UploadResult | null>(null)

  function validate(incoming: File[]): string | null {
    const combined = [...files, ...incoming]
    if (combined.length > cfg.maxFiles) return `Max ${cfg.maxFiles} file${cfg.maxFiles > 1 ? 's' : ''} allowed.`
    for (const f of combined) {
      if (!cfg.acceptMime.has(f.type) && !cfg.accept.some(ext => f.name.toLowerCase().endsWith(ext))) {
        return `Unsupported: ${f.name}`
      }
      if (f.size > cfg.maxMB * 1024 * 1024) return `${f.name} exceeds ${cfg.maxMB}MB limit.`
    }
    return null
  }

  function addFiles(list: FileList | File[]) {
    if (disabled) return
    const arr = Array.from(list)
    const err = validate(arr)
    if (err) { setError(err); return }
    setError('')
    setFiles(prev => [...prev, ...arr].slice(0, cfg.maxFiles))
  }

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); if (!disabled) setDragging(true) }, [disabled])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length && !disabled) addFiles(e.dataTransfer.files)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, disabled])

  async function handleUpload() {
    if (!files.length || uploading || disabled) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const res = await fetch(`/api/patents/${patentId}/upload-${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: fd,
      })
      const json = await res.json() as UploadResult & { error?: string }
      if (!res.ok) { setError(json.error || 'Upload failed'); setUploading(false); return }
      setResult(json)
      onSuccess(json)
    } catch {
      setError('Network error — please try again.')
      setUploading(false)
    }
  }

  // ── Done state ──────────────────────────────────────────────────────────────
  if (result) {
    const anyConverted = (result.files ?? []).some(f => f.converted)
    const anyLowContrast = (result.files ?? []).some(f => f.lowContrastWarning)

    return (
      <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-green-50 flex items-center gap-2">
          <span>{cfg.icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-green-700">
            {cfg.label} — Uploaded
          </span>
        </div>
        <div className="p-5 space-y-3">
          {/* Per-file results */}
          {(result.files ?? []).map((f, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                <span className="text-base">{f.converted ? '🖼️' : '📄'}</span>
                <span className="flex-1 truncate font-medium text-gray-700">
                  {f.outputName ?? f.name}
                </span>
                <span className="text-gray-400 flex-shrink-0">{formatBytes(f.size)}</span>
                {f.signed_url && (
                  <a
                    href={f.signed_url}
                    download={f.outputName ?? f.name}
                    className="text-indigo-500 hover:text-indigo-700 flex-shrink-0"
                    title="Download"
                  >
                    ⬇
                  </a>
                )}
              </div>
              {/* Per-file badges */}
              {f.converted && !f.lowContrastWarning && (
                <p className="text-xs text-green-700 pl-2">
                  ✅ Converted to USPTO-compliant format (greyscale, 300 DPI)
                </p>
              )}
              {f.lowContrastWarning && (
                <p className="text-xs text-amber-700 pl-2">
                  ⚠️ This image may not convert cleanly to line art. For best results, use a clean sketch or diagram with clear lines and high contrast.
                </p>
              )}
            </div>
          ))}

          {/* Summary badge */}
          {anyConverted && !anyLowContrast && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              ✅ All figures converted to USPTO-compliant greyscale PNG at 300 DPI. Ready to include in your filing package.
            </div>
          )}
          {anyLowContrast && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              ⚠️ One or more figures may not convert cleanly to line art. Photos or low-contrast images can become muddy greyscale. For best USPTO results, use clean sketches, CAD exports, or diagrams with clear lines.
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Upload state ────────────────────────────────────────────────────────────
  return (
    <div className={`bg-white rounded-xl border ${disabled ? 'border-gray-100 opacity-60' : 'border-gray-200'} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span>{cfg.icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{cfg.label}</span>
        {disabled && disabledReason && (
          <span className="ml-auto text-xs text-gray-400 italic">{disabledReason}</span>
        )}
      </div>
      <div className="p-5">
        {/* Helper text — figures only */}
        {cfg.helperText && !disabled && (
          <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">
            🖼️ {cfg.helperText}
          </p>
        )}

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
            disabled ? 'cursor-not-allowed border-gray-200' :
            dragging ? 'border-amber-400 bg-amber-50 cursor-copy' :
            'border-gray-200 hover:border-gray-300 cursor-pointer'
          }`}
        >
          <div className="text-2xl mb-2">{dragging ? '📂' : '⬆️'}</div>
          <p className="text-sm text-gray-500 font-medium mb-1">
            {disabled ? 'Complete previous steps first' : dragging ? 'Drop here' : 'Drag & drop or click to browse'}
          </p>
          <p className="text-xs text-gray-400">{cfg.hint}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple={cfg.maxFiles > 1}
          accept={cfg.accept.join(',')}
          style={{ display: 'none' }}
          onChange={e => e.target.files && addFiles(e.target.files)}
        />

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                <span className="text-base">{f.type.includes('pdf') ? '📄' : f.type.startsWith('image') ? '🖼️' : '📝'}</span>
                <span className="flex-1 truncate font-medium text-gray-700">{f.name}</span>
                <span className="text-gray-400 flex-shrink-0">{formatBytes(f.size)}</span>
                <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}
                  className="text-gray-300 hover:text-gray-500 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Processing note — figures only */}
        {type === 'figures' && files.length > 0 && !disabled && (
          <p className="mt-2 text-xs text-gray-400">
            Files will be auto-converted to greyscale PNG at 300 DPI on upload.
          </p>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠️ {error}</div>
        )}

        {files.length > 0 && (
          <button
            onClick={handleUpload}
            disabled={uploading || disabled}
            className="mt-4 w-full py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-semibold hover:bg-[#2d3561] disabled:opacity-50 transition-colors min-h-[44px]"
          >
            {uploading
              ? (type === 'figures' ? '⏳ Converting + uploading…' : 'Uploading…')
              : `Upload ${files.length} File${files.length > 1 ? 's' : ''} →`
            }
          </button>
        )}
      </div>
    </div>
  )
}
