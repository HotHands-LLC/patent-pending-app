'use client'
import Link from 'next/link'
import { Patent } from '@/lib/supabase'

interface TimelineStep {
  id: string
  label: string
  sublabel: string | null
  note: string | null
  cta?: { label: string; href: string }
  status: 'done' | 'current' | 'upcoming'
  date?: string
}

function getDaysLeft(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export default function FilingTimeline({ patent }: { patent: Patent }) {
  const appNum = (patent as Record<string,unknown>).application_number as string | null
  const provisionalNum = patent.provisional_number
  const filingDate = patent.filing_date
  const provisionalDeadline = patent.provisional_deadline
  const nonprovDeadline = (patent as Record<string,unknown>).nonprov_deadline_at as string | null
  const isProvisionalFiled = patent.filing_status === 'provisional_filed' || patent.filing_status === 'nonprov_filed'
  const isNonProvFiled = patent.filing_status === 'nonprov_filed'
  const isGranted = patent.status === 'granted'
  const daysLeft = provisionalDeadline ? getDaysLeft(provisionalDeadline) : null
  const npDaysLeft = nonprovDeadline ? getDaysLeft(nonprovDeadline) : null

  const steps: TimelineStep[] = [
    {
      id: 'conceived',
      label: 'Invention Conceived',
      sublabel: patent.title,
      note: filingDate ? `Started ${new Date(filingDate + 'T00:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'})}` : null,
      status: 'done',
    },
    {
      id: 'provisional',
      label: 'Provisional Application Filed',
      sublabel: provisionalNum ? `App #${provisionalNum}` : appNum ? `App #${appNum}` : null,
      note: isProvisionalFiled ? 'Your idea is protected for 12 months' : null,
      status: isProvisionalFiled ? 'done' : daysLeft !== null && daysLeft <= 30 ? 'current' : 'current',
      date: filingDate ?? undefined,
      cta: !isProvisionalFiled ? { label: 'File provisional →', href: '/dashboard/patents/' + patent.id + '?tab=filing' } : undefined,
    },
    {
      id: 'nonprov_deadline',
      label: 'Non-Provisional Deadline',
      sublabel: provisionalDeadline
        ? `${new Date(provisionalDeadline + 'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}${daysLeft !== null && !isNonProvFiled ? ` · ${daysLeft > 0 ? `${daysLeft} days remaining` : 'OVERDUE'}` : ''}`
        : nonprovDeadline ? new Date(nonprovDeadline).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : null,
      note: isNonProvFiled ? 'Filed ✅' : 'File your full application before this date',
      status: isNonProvFiled ? 'done' : isProvisionalFiled ? 'current' : 'upcoming',
      cta: isProvisionalFiled && !isNonProvFiled ? { label: 'Start non-provisional →', href: 'https://patentcenter.uspto.gov' } : undefined,
    },
    {
      id: 'examination',
      label: 'USPTO Examination',
      sublabel: isNonProvFiled ? 'In progress · estimated 12-18 months' : 'Estimated: 12-18 months after filing',
      note: null,
      status: isNonProvFiled ? 'current' : 'upcoming',
    },
    {
      id: 'granted',
      label: 'Patent Granted',
      sublabel: isGranted ? 'Congratulations 🎉' : 'Estimated: 2-3 years from provisional filing',
      note: null,
      status: isGranted ? 'done' : 'upcoming',
    },
  ]

  const COLORS = { done: '#059669', current: '#d97706', upcoming: '#94a3b8' }
  const ICONS = { done: '✅', current: '⏳', upcoming: '○' }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h2 className="font-semibold text-[#1a1f36] mb-4 text-sm">Patent Filing Journey</h2>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200" />
        <div className="space-y-5">
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-4 relative">
              {/* Icon */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 bg-white text-sm border-2"
                style={{ borderColor: COLORS[step.status] }}>
                {ICONS[step.status]}
              </div>
              {/* Content */}
              <div className="flex-1 pt-0.5 pb-1">
                <p className="text-sm font-semibold text-[#1a1f36]" style={{ color: step.status === 'upcoming' ? '#94a3b8' : undefined }}>
                  {step.label}
                  {step.status === 'current' && <span className="ml-2 text-xs font-normal text-amber-600">← Current step</span>}
                </p>
                {step.sublabel && <p className="text-xs text-gray-500 mt-0.5">{step.sublabel}</p>}
                {step.note && <p className="text-xs text-gray-400 mt-0.5 italic">&ldquo;{step.note}&rdquo;</p>}
                {step.cta && (
                  <Link href={step.cta.href} target={step.cta.href.startsWith('http') ? '_blank' : undefined}
                    className="inline-block mt-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold">
                    {step.cta.label}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
