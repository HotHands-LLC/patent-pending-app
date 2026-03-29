'use client'

interface Props {
  feature?: string
  onClose: () => void
}

const FEATURE_COPY: Record<string, { title: string; desc: string }> = {
  pattie:               { title: 'Pattie AI Assistant', desc: 'Chat with Pattie for filing guidance, claim strategy, and patent questions.' },
  claims_edit:          { title: 'AI Claims Refinement', desc: 'Run AI refinement passes to tighten claim language for USPTO precision.' },
  zip_download:         { title: 'Filing Package Download', desc: 'Download USPTO-ready filing packages with cover sheet, spec, and claims.' },
  correspondence_write: { title: 'Correspondence Logging', desc: 'Log emails, office actions, and attorney notes tied to your patent.' },
  marketplace_list:     { title: 'Marketplace Listing', desc: 'List your patent for licensing on the PatentPending Marketplace.' },
  default:              { title: 'Pro Feature', desc: 'This feature is available on PatentPending Pro.' },
}

export default function UpgradeModal({ feature, onClose }: Props) {
  const copy = FEATURE_COPY[feature ?? 'default'] ?? FEATURE_COPY['default']

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <span className="text-2xl">⚡</span>
        </div>

        {/* Heading */}
        <h3 className="text-lg font-bold text-[#1a1f36] mb-1">{copy.title}</h3>
        <p className="text-sm text-gray-500 mb-5">{copy.desc}</p>

        {/* What you get */}
        <div className="bg-amber-50 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Pro includes</p>
          <ul className="space-y-1.5">
            {[
              'Up to 10 patents',
              'Pattie AI assistant on every patent',
              'Unlimited AI Claims Refinement passes',
              'Filing package downloads (PDF + ZIP)',
              'Full correspondence logging',
              '1 Marketplace listing',
            ].map(item => (
              <li key={item} className="flex items-start gap-2 text-xs text-amber-900">
                <span className="text-amber-500 mt-0.5">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="space-y-2">
          <a
            href="/pricing"
            className="block w-full py-2.5 bg-[#1a1f36] text-white rounded-lg text-sm font-bold text-center hover:bg-[#2d3561] transition-colors"
          >
            Upgrade to Pro · from $49/mo →
          </a>
          <button
            onClick={onClose}
            className="block w-full py-2.5 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium text-center hover:bg-gray-50 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
