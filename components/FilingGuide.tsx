'use client'
/**
 * FilingGuide — step-by-step Patent Center filing walkthrough
 * Appears on the Filings tab when filing_status !== 'provisional_filed'
 *
 * Mirrors exactly what the user will see at patentcenter.uspto.gov.
 */

import React from 'react'

interface FilingGuideProps {
  patent: {
    title?: string | null
    inventors?: unknown
    entity_status?: 'micro' | 'small' | 'large' | null
    filing_status?: string | null
    spec_draft?: string | null
    claims_draft?: string | null
    figures_uploaded?: boolean | null
    cover_sheet_acknowledged?: boolean | null
  }
  hasDownloadedZip?: boolean
}

interface ExpandableNoteProps {
  label: string
  children: React.ReactNode
}

function ExpandableNote({ label, children }: ExpandableNoteProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        {label}
      </button>
      {open && (
        <div className="mt-2 ml-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-gray-700 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}

interface StepProps {
  num: number
  title: string
  status: 'done' | 'active' | 'pending'
  children: React.ReactNode
}

function Step({ num, title, status, children }: StepProps) {
  const [open, setOpen] = React.useState(status === 'active')

  const iconCls =
    status === 'done'   ? 'bg-green-500 text-white' :
    status === 'active' ? 'bg-[#1a1f36] text-white' :
                          'bg-gray-200 text-gray-500'

  const borderCls =
    status === 'done'   ? 'border-green-200 bg-green-50' :
    status === 'active' ? 'border-[#1a1f36]/20 bg-white shadow-sm' :
                          'border-gray-200 bg-gray-50'

  return (
    <div className={`rounded-xl border ${borderCls} overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${iconCls}`}>
          {status === 'done' ? '✓' : num}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${status === 'pending' ? 'text-gray-400' : 'text-gray-900'}`}>
            {title}
          </div>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 pt-1 text-sm text-gray-700 space-y-2 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

export default function FilingGuide({ patent, hasDownloadedZip = false }: FilingGuideProps) {
  const inventorName = (() => {
    try {
      const inv = patent.inventors
      if (Array.isArray(inv) && inv.length > 0) {
        const i = inv[0] as Record<string, string>
        return [i.first_name, i.last_name].filter(Boolean).join(' ') || 'Inventor Name'
      }
    } catch { /* ignore */ }
    return 'Inventor Name'
  })()

  const entityLabel =
    patent.entity_status === 'micro' ? 'Micro Entity' :
    patent.entity_status === 'large' ? 'Large Entity (Undiscounted)' :
    'Small Entity'

  const filingFee =
    patent.entity_status === 'micro' ? '$160' :
    patent.entity_status === 'large' ? '$640' :
    '$320'

  const hasSpec    = !!patent.spec_draft?.trim()
  const hasClaims  = !!patent.claims_draft?.trim()
  const hasFigures = !!patent.figures_uploaded

  // Step completion heuristic
  const step3Done = hasDownloadedZip || (hasSpec && hasClaims)
  const step4Done = hasFigures && hasDownloadedZip
  const activeStep: number =
    !step3Done ? 3 :
    !step4Done ? 4 :
    5

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🏛️</span>
        <div>
          <div className="font-semibold text-gray-900 text-sm">USPTO Patent Center — Filing Guide</div>
          <div className="text-xs text-gray-500">
            Provisional application at{' '}
            <a href="https://patentcenter.uspto.gov" target="_blank" rel="noopener noreferrer"
               className="text-blue-600 hover:underline">patentcenter.uspto.gov</a>
          </div>
        </div>
      </div>

      <Step num={1} title="Go to Patent Center → New Application → Provisional Application"
            status={activeStep > 1 ? 'done' : activeStep === 1 ? 'active' : 'pending'}>
        <ol className="space-y-1 list-decimal list-inside">
          <li>Go to <a href="https://patentcenter.uspto.gov" target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium">patentcenter.uspto.gov</a> and sign in</li>
          <li>Click <strong>New Application</strong></li>
          <li>Select <strong>Provisional Application</strong></li>
          <li>You will see the document upload interface</li>
        </ol>
      </Step>

      <Step num={2} title="Application Data Sheet (ADS) — enter fields manually"
            status={activeStep > 2 ? 'done' : activeStep === 2 ? 'active' : 'pending'}>
        <div className="space-y-2">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-medium">
            ⚠️ Do NOT upload your ADS PDF — enter the fields in Patent Center's web form instead.
          </div>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Click <strong>"Change ADS filing method"</strong> → choose <strong>"Fill out form online"</strong></li>
            <li>Use your <strong>ADS Reference Card</strong> (in your downloaded package) to copy values</li>
            <li>Title: <span className="font-mono text-xs bg-gray-100 px-1 rounded">{patent.title ?? 'Your invention title'}</span></li>
            <li>Inventor: <span className="font-mono text-xs bg-gray-100 px-1 rounded">{inventorName}</span></li>
            <li>Entity status: <strong>{entityLabel}</strong> — already shown in your ADS reference card</li>
            <li>Application type: <strong>Provisional Application</strong></li>
            <li>Click <strong>"Add to Documents"</strong></li>
          </ol>
          <ExpandableNote label="Why not upload the ADS PDF?">
            <p>
              USPTO Patent Center only accepts the official <strong>Adobe LiveCycle XFA form</strong> for ADS upload.
              Our cover sheet is a reference document — use it to fill in Patent Center&apos;s web form.
              This is how all pro se filers (and most law firm tools) handle ADS for provisional applications.
              The web form captures all the same information.
            </p>
          </ExpandableNote>
          <ExpandableNote label="What is entity status and why does it matter?">
            <p>
              Entity status determines your filing fees. <strong>Small Entity</strong> gets a 60% discount off
              regular fees. <strong>Micro Entity</strong> gets an 80% discount. Claiming a lower status you
              don&apos;t qualify for is a federal offense — check the criteria carefully. Most individual inventors
              with no prior patent assignments qualify for Micro Entity status. If your gross income exceeded
              $239,583 (2025 threshold) or you&apos;ve assigned rights to a large entity, choose Small or Large.
            </p>
          </ExpandableNote>
        </div>
      </Step>

      <Step num={3} title="Upload Specification + Claims"
            status={step3Done ? 'done' : activeStep === 3 ? 'active' : 'pending'}>
        <ol className="space-y-1 list-decimal list-inside">
          <li>Click <strong>"Add Document"</strong></li>
          <li>Browse to <strong>02-specification-and-claims.txt</strong> (in your downloaded ZIP)</li>
          <li>Document type: <strong>Specification</strong></li>
          <li>Click <strong>"Add to Documents"</strong></li>
        </ol>
        {!hasSpec && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs mt-1">
            ⚠️ Specification not yet generated — complete Step 5 first
          </div>
        )}
        {!hasClaims && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs mt-1">
            ⚠️ Claims not yet generated — generate and approve claims first
          </div>
        )}
      </Step>

      <Step num={4} title="Upload Drawings"
            status={step4Done ? 'done' : activeStep === 4 ? 'active' : 'pending'}>
        {hasFigures ? (
          <ol className="space-y-1 list-decimal list-inside">
            <li>Click <strong>"Add Document"</strong></li>
            <li>Browse to <strong>04-drawings.pdf</strong> (in your downloaded ZIP)</li>
            <li>Document type: <strong>Drawings</strong></li>
            <li>Click <strong>"Add to Documents"</strong></li>
          </ol>
        ) : (
          <div className="p-2 bg-gray-50 border border-gray-200 rounded text-gray-600 text-xs">
            No figures uploaded yet. Drawings are optional for provisional applications but strongly recommended
            — they help establish the scope of your invention.
          </div>
        )}
      </Step>

      <Step num={5} title="Foreign Filing &amp; submission checkboxes"
            status="pending">
        <div className="space-y-2">
          <div className="grid gap-1">
            {[
              ['Submitting application under 35 USC 111(b)', 'YES — this is a provisional'],
              ['Filing with foreign priority claim', 'NO — unless you filed abroad first'],
              ['PCT application', 'NO — not applicable for US provisional'],
              ['Request not to publish', 'Your choice — provisionals don\'t publish anyway; checking prevents 18-month publication'],
            ].map(([q, a]) => (
              <div key={q} className="flex gap-2 text-xs">
                <span className="text-gray-500 flex-1">{q}</span>
                <span className="font-medium text-gray-900 flex-shrink-0">→ {a}</span>
              </div>
            ))}
          </div>
          <ExpandableNote label="What about foreign filing? (full explanation)">
            <p>
              Unless you have already filed this invention in another country, answer <strong>NO</strong> to all
              foreign filing questions. For most US inventors filing their first patent, all foreign filing
              checkboxes should be unchecked.
            </p>
            <p className="mt-2">
              If you later want to file internationally, you have <strong>12 months from your provisional
              filing date</strong> to do so via the PCT (Patent Cooperation Treaty). PatentPending will remind
              you of this deadline.
            </p>
          </ExpandableNote>
        </div>
      </Step>

      <Step num={6} title={`Pay filing fee — ${entityLabel}: ${filingFee}`} status="pending">
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2 bg-gray-50 rounded border border-gray-200 text-center">
              <div className="font-bold text-gray-900">$160</div>
              <div className="text-gray-500">Micro Entity</div>
            </div>
            <div className={`p-2 rounded border-2 text-center ${patent.entity_status === 'small' || !patent.entity_status ? 'border-blue-400 bg-blue-50' : 'bg-gray-50 border-gray-200'}`}>
              <div className="font-bold text-gray-900">$320</div>
              <div className="text-gray-500">Small Entity</div>
              {(patent.entity_status === 'small' || !patent.entity_status) && <div className="text-blue-600 text-xs font-semibold">← Your status</div>}
            </div>
            <div className={`p-2 rounded border text-center ${patent.entity_status === 'large' ? 'border-red-300 bg-red-50' : 'bg-gray-50 border-gray-200'}`}>
              <div className="font-bold text-gray-900">$640</div>
              <div className="text-gray-500">Large Entity</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            No search or examination fees for provisional applications — only the basic filing fee.
            Pay by credit card in Patent Center.
          </p>
          {patent.entity_status === 'micro' && (
            <div className="text-xs text-green-700 font-medium">
              ✓ You&apos;re set as Micro Entity — make sure you qualify (gross income under USPTO threshold, no prior assignments to large entities)
            </div>
          )}
        </div>
      </Step>

      <Step num={7} title="Download your filing receipt → Mark as Filed" status="pending">
        <div className="space-y-2">
          <ol className="space-y-1 list-decimal list-inside">
            <li>After payment, USPTO will display a <strong>filing receipt</strong> with your provisional application number (format: <code className="bg-gray-100 px-1 rounded text-xs">63/xxx,xxx</code>)</li>
            <li>Download and save the receipt PDF</li>
            <li>Come back to PatentPending and click <strong>"Mark as Filed"</strong> on the Filings tab</li>
            <li>Enter your application number — this starts your <strong>12-month non-provisional clock</strong></li>
          </ol>
          <div className="p-2 bg-green-50 border border-green-200 rounded text-green-800 text-xs">
            🎉 After you mark as filed, PatentPending will show your non-provisional deadline countdown.
          </div>
        </div>
      </Step>
    </div>
  )
}
