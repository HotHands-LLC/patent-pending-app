'use client'
/**
 * AdsPreFillCard — Filing Prep tab component for /dashboard/patents/[id]
 *
 * Shows pre-filled ADS (Application Data Sheet) field values pulled from
 * the patents table + patent_profiles. Pure DB read + display — no AI cost.
 *
 * Fields:
 *  - Invention title
 *  - Inventor name / address / citizenship
 *  - Correspondence email
 *  - USPTO customer number
 *  - Priority claim (provisional_app_number + provisional_filed_at)
 *  - Entity status
 */

import React, { useEffect, useState, useCallback } from 'react'
import type { Patent } from '@/lib/supabase'

interface ProfileData {
  full_name?: string | null
  name_first?: string | null
  name_middle?: string | null
  name_last?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  uspto_customer_number?: string | null
  email?: string | null
}

interface AdsPreFillCardProps {
  patent: Patent
  authToken: string
  userEmail: string
}

interface FieldGroupProps {
  label: string
  fields: { label: string; value: string }[]
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className={`ml-2 px-2 py-0.5 text-xs rounded transition-colors ${
        copied
          ? 'bg-green-100 text-green-700 font-semibold'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
      }`}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function FieldGroup({ label, fields }: FieldGroupProps) {
  const allValues = fields.map(f => `${f.label}: ${f.value}`).join('\n')
  const hasRealValues = fields.some(f => f.value && f.value !== '—')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
        {hasRealValues && <CopyButton text={allValues} />}
      </div>
      <div className="divide-y divide-gray-50">
        {fields.map(({ label: fieldLabel, value }) => (
          <div key={fieldLabel} className="flex items-start gap-3 px-4 py-2.5">
            <span className="text-xs text-gray-400 w-36 flex-shrink-0 mt-0.5">{fieldLabel}</span>
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className={`text-sm font-medium truncate ${value === '—' ? 'text-gray-300' : 'text-gray-800'}`}>
                {value}
              </span>
              {value !== '—' && <CopyButton text={value} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdsPreFillCard({ patent, authToken, userEmail }: AdsPreFillCardProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/users/profile', {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`)
        const json = await res.json()
        setProfile(json.profile ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [authToken])

  // ── Derived values ──────────────────────────────────────────────────────────

  const inventorName = (() => {
    if (profile?.name_first || profile?.name_last) {
      return [profile.name_first, profile.name_middle, profile.name_last]
        .filter(Boolean).join(' ')
    }
    return profile?.full_name || patent.inventor_name || patent.inventors?.[0] || '—'
  })()

  const address = (() => {
    if (!profile) return '—'
    const parts = [
      profile.address_line_1,
      profile.address_line_2,
      profile.city && profile.state ? `${profile.city}, ${profile.state} ${profile.zip ?? ''}`.trim() : profile.city || profile.state,
      profile.country && profile.country !== 'US' ? profile.country : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : '—'
  })()

  const citizenship = profile?.country || 'US'

  const correspondenceEmail = userEmail || '—'

  const customerNumber = (
    (patent as Record<string, unknown>).uspto_customer_number as string | null
    || profile?.uspto_customer_number
    || '—'
  )

  const priorityClaim = (() => {
    const appNum = (patent as Record<string, unknown>).provisional_app_number as string | null
    const filedAt = (patent as Record<string, unknown>).provisional_filed_at as string | null
    if (!appNum && !filedAt) return '—'
    const parts: string[] = []
    if (appNum) parts.push(`App No. ${appNum}`)
    if (filedAt) {
      try {
        const d = new Date(filedAt)
        parts.push(`Filed ${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`)
      } catch {
        parts.push(filedAt)
      }
    }
    return parts.join(' — ') || '—'
  })()

  const entityStatus = (() => {
    const es = patent.entity_status
    if (!es) return '—'
    return es.charAt(0).toUpperCase() + es.slice(1) + ' Entity'
  })()

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#1a1f36] border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-sm text-gray-500">Loading ADS fields…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        ⚠️ Could not load profile data: {error}
      </div>
    )
  }

  const missingFields: string[] = []
  if (inventorName === '—') missingFields.push('inventor name')
  if (address === '—') missingFields.push('mailing address')
  if (customerNumber === '—') missingFields.push('USPTO customer number')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#1a1f36]">📋 ADS Pre-Fill</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Application Data Sheet values — copy into USPTO Patent Center
          </p>
        </div>
        <a
          href="https://patentcenter.uspto.gov/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline"
        >
          Open Patent Center ↗
        </a>
      </div>

      {/* Missing fields banner */}
      {missingFields.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <strong>⚠️ Incomplete profile:</strong> Missing {missingFields.join(', ')}.{' '}
          <a href="/profile" className="underline font-semibold">Update your profile →</a>
        </div>
      )}

      {/* Invention */}
      <FieldGroup
        label="Invention"
        fields={[
          { label: 'Title', value: patent.title || '—' },
        ]}
      />

      {/* Inventor */}
      <FieldGroup
        label="Inventor"
        fields={[
          { label: 'Name', value: inventorName },
          { label: 'Mailing Address', value: address },
          { label: 'Citizenship', value: citizenship },
        ]}
      />

      {/* Correspondence */}
      <FieldGroup
        label="Correspondence"
        fields={[
          { label: 'Email', value: correspondenceEmail },
          { label: 'Customer Number', value: customerNumber },
        ]}
      />

      {/* Priority Claim */}
      <FieldGroup
        label="Priority Claim (Provisional)"
        fields={[
          { label: 'Application Number', value: (patent as Record<string, unknown>).provisional_app_number as string || '—' },
          { label: 'Filing Date', value: (() => {
            const filedAt = (patent as Record<string, unknown>).provisional_filed_at as string | null
            if (!filedAt) return '—'
            try {
              return new Date(filedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
            } catch { return filedAt }
          })() },
          { label: 'Combined', value: priorityClaim },
        ]}
      />

      {/* Entity Status */}
      <FieldGroup
        label="Applicant Info"
        fields={[
          { label: 'Entity Status', value: entityStatus },
        ]}
      />

      {/* Footer note */}
      <p className="text-xs text-gray-400 pt-1">
        💡 These values are pre-filled from your patent record and profile. Always verify against your official filing receipt before submitting to the USPTO.
      </p>
    </div>
  )
}
