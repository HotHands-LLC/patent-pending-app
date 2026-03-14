'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Patent } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormContact {
  name_first:     string
  name_middle:    string
  name_last:      string
  organization:   string
  address_line_1: string
  address_line_2: string
  city:           string
  state:          string
  zip:            string
  country:        string
  phone:          string
  email:          string
}

interface CoverSheetForm {
  title:              string
  inventor:           FormContact
  correspondence:     FormContact
  entity_status:      'micro' | 'small' | 'large'
  prior_app_number:   string
  prior_app_date:     string
  signature:          string
  signature_date:     string
  customer_number:    string
  assignee_name:      string
  assignee_address:   string
}

interface SavedContact {
  id: string
  contact_type: string
  is_default: boolean
  name_first: string | null
  name_middle: string | null
  name_last: string | null
  organization: string | null
  address_line_1: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string
  phone: string | null
  email: string | null
}

interface FormVersion { form_number: string; form_title: string; version_date: string }

// ── Editable field component ──────────────────────────────────────────────────

function EditField({
  label, value, onChange, placeholder, note, width = 'full', type = 'text', disabled
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; note?: string; width?: 'full' | 'half' | 'third'
  type?: string; disabled?: boolean
}) {
  return (
    <div className={`mb-3 ${width === 'half' ? 'w-full' : width === 'third' ? 'w-full' : 'w-full'}`}>
      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        disabled={disabled}
        className={`w-full text-sm border-b-2 border-gray-400 bg-transparent pb-1 focus:outline-none focus:border-indigo-600 transition-colors ${
          value ? 'text-gray-900' : 'text-gray-400 italic'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''} print:border-gray-800 print:text-gray-900`}
      />
      {note && <div className="text-xs text-gray-400 mt-0.5 italic print:hidden">{note}</div>}
    </div>
  )
}

function CheckboxField({
  id, label, checked, note
}: { id: string; label: string; checked: boolean; note?: string }) {
  return (
    <div className="flex items-start gap-3 mb-2">
      <span className="font-bold text-lg leading-none mt-0.5 text-gray-800 select-none">
        {checked ? '☑' : '☐'}
      </span>
      <div>
        <span className="text-sm">{label}</span>
        {note && <div className="text-xs text-gray-400 italic mt-0.5 print:hidden">{note}</div>}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CoverSheetPage() {
  const params   = useParams()
  const router   = useRouter()
  const patentId = params.id as string

  const [patent,         setPatent]         = useState<Patent | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [authToken,      setAuthToken]      = useState<string | null>(null)
  const [savedContacts,  setSavedContacts]  = useState<SavedContact[]>([])
  const [formVersion,    setFormVersion]    = useState<FormVersion | null>(null)
  const [selectedContact, setSelectedContact] = useState<string>('default')
  const [saveToProfile,  setSaveToProfile]  = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [saveMsg,        setSaveMsg]        = useState('')

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const todayShort = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

  const [form, setForm] = useState<CoverSheetForm>({
    title:            '',
    inventor: { name_first: '', name_middle: '', name_last: '', organization: '',
      address_line_1: '', address_line_2: '', city: '', state: '', zip: '', country: 'US', phone: '', email: '' },
    correspondence: { name_first: '', name_middle: '', name_last: '', organization: '',
      address_line_1: '', address_line_2: '', city: '', state: '', zip: '', country: 'US', phone: '', email: '' },
    entity_status:    'small',
    prior_app_number: '',
    prior_app_date:   '',
    signature:        '',
    signature_date:   todayShort,
    customer_number:  '',
    assignee_name:    '',
    assignee_address: '',
  })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setAuthToken(session.access_token)

      // Load patent
      const { data: p } = await supabase.from('patents')
        .select('*').eq('id', patentId).single()
      if (!p) { router.push('/dashboard/patents'); return }
      setPatent(p)

      // Load user profile
      const res = await fetch('/api/users/profile', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const { profile } = await res.json()

      // Load saved contacts
      const cRes = await fetch('/api/users/contacts?type=inventor', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const { contacts } = await cRes.json()
      setSavedContacts(contacts ?? [])

      // Load USPTO form version
      const { data: fv } = await supabase.from('uspto_form_versions')
        .select('form_number, form_title, version_date')
        .eq('is_active', true)
        .eq('form_number', 'PTO/AIA/14')
        .single()
      setFormVersion(fv as FormVersion | null)

      // Pre-fill form from profile + patent
      const defaultContact = contacts?.find((c: SavedContact) => c.is_default) ?? null
      const inventorName = [profile?.name_first, profile?.name_middle, profile?.name_last].filter(Boolean).join(' ')
        || p.inventors?.[0] || ''

      const firstName  = profile?.name_first  || inventorName.split(' ')[0] || ''
      const middleName = profile?.name_middle  || ''
      const lastName   = profile?.name_last    ||
        (inventorName.split(' ').length > 1 ? inventorName.split(' ').slice(-1)[0] : '')

      const sigStr = [firstName, middleName, lastName].filter(Boolean).join(' ')

      setForm(prev => ({
        ...prev,
        title:            p.title || '',
        prior_app_number: p.provisional_number || p.application_number || '',
        inventor: {
          name_first:     firstName,
          name_middle:    middleName,
          name_last:      lastName,
          organization:   profile?.company || '',
          address_line_1: defaultContact?.address_line_1 || profile?.address_line_1 || '',
          address_line_2: '',
          city:           defaultContact?.city  || profile?.city  || '',
          state:          defaultContact?.state || profile?.state || '',
          zip:            defaultContact?.zip   || profile?.zip   || '',
          country:        defaultContact?.country || profile?.country || 'US',
          phone:          defaultContact?.phone || profile?.phone || '',
          email:          defaultContact?.email || profile?.email || '',
        },
        correspondence: {
          name_first:     firstName,
          name_middle:    middleName,
          name_last:      lastName,
          organization:   profile?.company || '',
          address_line_1: defaultContact?.address_line_1 || profile?.address_line_1 || '',
          address_line_2: '',
          city:           defaultContact?.city  || profile?.city  || '',
          state:          defaultContact?.state || profile?.state || '',
          zip:            defaultContact?.zip   || profile?.zip   || '',
          country:        defaultContact?.country || profile?.country || 'US',
          phone:          defaultContact?.phone || profile?.phone || '',
          email:          defaultContact?.email || profile?.email || '',
        },
        entity_status:    (p.entity_status as 'micro' | 'small' | 'large' | null) ?? 'small',
        signature:        `/${sigStr}/`,
        signature_date:   todayShort,
        customer_number:  (p as Record<string,unknown>).uspto_customer_number as string ?? profile?.uspto_customer_number ?? '',
        assignee_name:    profile?.default_assignee_name ?? '',
        assignee_address: profile?.default_assignee_address ?? '',
      }))

      setLoading(false)
    }
    load()
  }, [patentId, router])

  // Update form when contact selection changes
  useEffect(() => {
    if (selectedContact === 'default') return
    const c = savedContacts.find(sc => sc.id === selectedContact)
    if (!c) return
    setForm(prev => ({
      ...prev,
      inventor: {
        ...prev.inventor,
        name_first:     c.name_first     || prev.inventor.name_first,
        name_middle:    c.name_middle    || '',
        name_last:      c.name_last      || prev.inventor.name_last,
        organization:   c.organization   || '',
        address_line_1: c.address_line_1 || '',
        city:           c.city           || '',
        state:          c.state          || '',
        zip:            c.zip            || '',
        country:        c.country        || 'US',
        phone:          c.phone          || '',
        email:          c.email          || '',
      }
    }))
  }, [selectedContact, savedContacts])

  // Auto-update signature when name changes
  const autoSigRef = useRef(true)
  function updateInventorName(field: 'name_first' | 'name_middle' | 'name_last', value: string) {
    setForm(prev => {
      const next = { ...prev, inventor: { ...prev.inventor, [field]: value } }
      if (autoSigRef.current) {
        const parts = [
          field === 'name_first' ? value : prev.inventor.name_first,
          field === 'name_middle' ? value : prev.inventor.name_middle,
          field === 'name_last' ? value : prev.inventor.name_last,
        ].filter(Boolean)
        next.signature = `/${parts.join(' ')}/`
      }
      return next
    })
  }

  function setInventor(field: keyof FormContact, value: string) {
    if (field === 'name_first' || field === 'name_middle' || field === 'name_last') {
      updateInventorName(field, value)
    } else {
      setForm(prev => ({ ...prev, inventor: { ...prev.inventor, [field]: value } }))
    }
  }
  function setCorrespondence(field: keyof FormContact, value: string) {
    setForm(prev => ({ ...prev, correspondence: { ...prev.correspondence, [field]: value } }))
  }

  async function handleSaveAndPrint() {
    setSaving(true)
    setSaveMsg('')
    try {
      if (saveToProfile && authToken) {
        const res = await fetch('/api/cover-sheet/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            patent_id: patentId,
            save_to_profile: true,
            inventor: {
              ...form.inventor,
              ...(form.customer_number ? { uspto_customer_number: form.customer_number } : {}),
            },
            assignee_name:    form.assignee_name    || null,
            assignee_address: form.assignee_address || null,
          }),
        })
        const d = await res.json()
        if (res.ok) setSaveMsg('✅ Profile updated with your cover sheet info')
        else setSaveMsg(`⚠️ Save failed: ${d.error}`)
      }
      setTimeout(() => window.print(), 150)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>
  if (!patent) return null

  const fullInvName = [form.inventor.name_first, form.inventor.name_middle, form.inventor.name_last]
    .filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>

      {/* ── Toolbar (non-printable) ─────────────────────────────────────────── */}
      <div className="print:hidden bg-[#1a1f36] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20">
        <Link href={`/dashboard/patents/${patentId}`} className="text-sm text-gray-300 hover:text-white">
          ← Back to Patent
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Contact selector */}
          {savedContacts.length > 1 && (
            <select
              value={selectedContact}
              onChange={e => setSelectedContact(e.target.value)}
              className="text-xs px-2 py-1.5 rounded bg-white/10 text-white border border-white/20 focus:outline-none"
            >
              <option value="default">Default contact</option>
              {savedContacts.map(c => (
                <option key={c.id} value={c.id}>
                  {[c.name_first, c.name_last].filter(Boolean).join(' ')} ({c.contact_type})
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveToProfile}
              onChange={e => setSaveToProfile(e.target.checked)}
              className="rounded"
            />
            Save changes to profile
          </label>
          <button
            onClick={handleSaveAndPrint}
            disabled={saving}
            className="px-4 py-1.5 bg-white text-[#1a1f36] rounded text-sm font-bold hover:bg-gray-100 disabled:opacity-60"
          >
            {saving ? 'Saving…' : '🖨️ Save & Generate PDF'}
          </button>
          <Link
            href={`/dashboard/patents/${patentId}?ack=cover-sheet`}
            className="px-4 py-1.5 bg-green-500 text-white rounded text-sm font-bold hover:bg-green-600"
          >
            ✅ Mark as Complete
          </Link>
        </div>
      </div>

      {/* Save feedback */}
      {saveMsg && (
        <div className="print:hidden bg-green-50 border-b border-green-200 px-6 py-2 text-xs text-green-800">
          {saveMsg}
        </div>
      )}

      {/* ── Form body ──────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-8 py-8">

        {/* Header */}
        <div className="text-center mb-6 pb-5 border-b-2 border-gray-800">
          <div className="text-xs font-sans text-gray-500 mb-1 uppercase tracking-widest">
            United States Patent and Trademark Office
          </div>
          <h1 className="text-xl font-bold mb-1 uppercase tracking-wider">Application Data Sheet</h1>
          <div className="text-sm text-gray-600 mb-1">37 CFR 1.76</div>
          <div className="flex items-center justify-center gap-3 text-xs font-sans text-gray-400 mt-2 print:hidden">
            <span>Generated by PatentPending.app · {today}</span>
            {formVersion && (
              <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500">
                Form {formVersion.form_number} · {new Date(formVersion.version_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            )}
          </div>
          <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded text-xs font-sans text-amber-800 print:hidden">
            ⚠️ <strong>DRAFT</strong> — Edit fields below, then click "Save &amp; Generate PDF". File at{' '}
            <strong>patentcenter.uspto.gov</strong>
          </div>
        </div>

        {/* ── Section 1: Application Information ─────────────────────────── */}
        <section className="mb-7">
          <h2 className="text-xs font-bold border-b border-gray-600 pb-1 mb-4 uppercase tracking-widest font-sans">
            1. Application Information
          </h2>
          <EditField
            label="Title of Invention"
            value={form.title}
            onChange={v => setForm(prev => ({ ...prev, title: v }))}
            note="5–15 words — must match your specification title"
          />
          <div className="grid grid-cols-2 gap-5">
            <EditField label="Application Number" value="" onChange={() => {}}
              placeholder="___________________" note="Assigned by USPTO upon filing" disabled />
            <EditField label="Filing Date" value="" onChange={() => {}}
              placeholder="___________________" note="Assigned by USPTO" disabled />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <EditField label="Attorney Docket Number" value="" onChange={() => {}}
              placeholder="(optional)" />
            <EditField label="Customer Number" value={form.customer_number}
              onChange={v => setForm(prev => ({ ...prev, customer_number: v }))}
              placeholder="e.g. 214633" note="Your USPTO customer number if assigned" />
          </div>
        </section>

        {/* ── Section 2: Inventor Information ────────────────────────────── */}
        <section className="mb-7">
          <h2 className="text-xs font-bold border-b border-gray-600 pb-1 mb-4 uppercase tracking-widest font-sans">
            2. Inventor or Joint Inventor Information
          </h2>
          <div className="pl-3 border-l-2 border-gray-300 mb-5">
            <div className="text-xs font-bold text-gray-500 mb-3 uppercase font-sans">
              Inventor 1 — First Named Inventor
            </div>
            {/* USPTO ADS field names */}
            <div className="grid grid-cols-3 gap-4">
              <EditField label="Given Name" value={form.inventor.name_first}
                onChange={v => setInventor('name_first', v)} placeholder="e.g. Chad" />
              <EditField label="Middle Name" value={form.inventor.name_middle}
                onChange={v => setInventor('name_middle', v)} placeholder="e.g. Len" />
              <EditField label="Family Name" value={form.inventor.name_last}
                onChange={v => setInventor('name_last', v)} placeholder="e.g. Bostwick" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <EditField label="Street Address" value={form.inventor.address_line_1}
                onChange={v => setInventor('address_line_1', v)}
                placeholder="Street address (required by USPTO)" />
              <EditField label="City" value={form.inventor.city}
                onChange={v => setInventor('city', v)} placeholder="City" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <EditField label="State" value={form.inventor.state}
                onChange={v => setInventor('state', v)} placeholder="TX" />
              <EditField label="Postal Code" value={form.inventor.zip}
                onChange={v => setInventor('zip', v)} placeholder="79424" />
              <EditField label="Country" value={form.inventor.country}
                onChange={v => setInventor('country', v)} placeholder="US" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <EditField label="Telephone" value={form.inventor.phone}
                onChange={v => setInventor('phone', v)} placeholder="(806) 555-1234" />
              <EditField label="Email" value={form.inventor.email}
                onChange={v => setInventor('email', v)} placeholder="inventor@example.com"
                type="email" />
            </div>
            <EditField label="Citizenship" value="United States"
              onChange={() => {}} disabled
              note="US citizens only — international inventors see 37 CFR 1.63" />
          </div>
        </section>

        {/* ── Section 3: Correspondence Information ──────────────────────── */}
        <section className="mb-7">
          <h2 className="text-xs font-bold border-b border-gray-600 pb-1 mb-3 uppercase tracking-widest font-sans">
            3. Correspondence Information
          </h2>
          <div className="text-xs font-sans text-gray-500 mb-3">
            Check one: □ Customer Number (enter above) &nbsp; ■ Correspondence address below
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Given Name" value={form.correspondence.name_first}
              onChange={v => setCorrespondence('name_first', v)} />
            <EditField label="Family Name" value={form.correspondence.name_last}
              onChange={v => setCorrespondence('name_last', v)} />
          </div>
          <EditField label="Organization / Firm Name" value={form.correspondence.organization}
            onChange={v => setCorrespondence('organization', v)}
            placeholder="Leave blank if filing pro se" />
          <EditField label="Street Address" value={form.correspondence.address_line_1}
            onChange={v => setCorrespondence('address_line_1', v)} />
          <div className="grid grid-cols-3 gap-4">
            <EditField label="City" value={form.correspondence.city}
              onChange={v => setCorrespondence('city', v)} />
            <EditField label="State" value={form.correspondence.state}
              onChange={v => setCorrespondence('state', v)} />
            <EditField label="Postal Code" value={form.correspondence.zip}
              onChange={v => setCorrespondence('zip', v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Telephone" value={form.correspondence.phone}
              onChange={v => setCorrespondence('phone', v)} />
            <EditField label="Email" value={form.correspondence.email}
              onChange={v => setCorrespondence('email', v)} type="email" />
          </div>
        </section>

        {/* ── Section 4: Entity Status ────────────────────────────────────── */}
        <section className="mb-7">
          <h2 className="text-xs font-bold border-b border-gray-600 pb-1 mb-4 uppercase tracking-widest font-sans">
            4. Application Type / Entity Status
          </h2>
          <div className="text-sm mb-4">
            <div className="text-xs font-sans text-gray-500 mb-2 uppercase tracking-wider">Application Type</div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-bold">■</span> Provisional Application under 35 U.S.C. 111(b)
            </div>
          </div>
          <div className="text-xs font-sans text-gray-500 mb-2 uppercase tracking-wider">Entity Status</div>
          {(['micro', 'small', 'large'] as const).map(status => (
            <div key={status}
              onClick={async () => {
                setForm(prev => ({ ...prev, entity_status: status }))
                // Persist to DB so it's remembered across sessions
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.access_token) {
                  fetch(`/api/patents/${patentId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ entity_status: status }),
                  }).catch(() => {/* non-blocking */})
                }
              }}
              className="flex items-start gap-3 mb-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 print:cursor-default print:hover:bg-transparent"
            >
              <span className="font-bold text-lg leading-none mt-0.5 select-none">
                {form.entity_status === status ? '☑' : '☐'}
              </span>
              <div className="text-sm">
                {status === 'micro' && <><strong>Micro Entity</strong> — 37 CFR 1.29 · Fee discount ~80%</>}
                {status === 'small' && <><strong>Small Entity</strong> — 37 CFR 1.27 · Fee discount ~60%</>}
                {status === 'large' && <><strong>Undiscounted</strong> (Large Entity)</>}
              </div>
            </div>
          ))}
        </section>

        {/* ── Section 5: Prior-Filed Applications ────────────────────────── */}
        <section className="mb-7">
          <h2 className="text-xs font-bold border-b border-gray-600 pb-1 mb-4 uppercase tracking-widest font-sans">
            5. Prior-Filed Applications (Domestic Benefit / Foreign Priority)
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <EditField label="Prior Application Number"
              value={form.prior_app_number}
              onChange={v => setForm(prev => ({ ...prev, prior_app_number: v }))}
              placeholder="63/000,000" note="e.g. provisional app. no." />
            <EditField label="Filing Date"
              value={form.prior_app_date}
              onChange={v => setForm(prev => ({ ...prev, prior_app_date: v }))}
              placeholder="MM/DD/YYYY" />
            <EditField label="Relationship"
              value="This application claims the benefit of the above provisional application."
              onChange={() => {}} disabled />
          </div>
          <p className="text-xs font-sans text-gray-500 mt-1">
            If this IS the provisional, leave blank. Reference this provisional when filing the non-provisional.
          </p>
        </section>

        {/* ── Section 6: Assignee Information ────────────────────────────── */}
        <section className="mb-7">
          <h2 className="text-xs font-bold border-b border-gray-600 pb-1 mb-4 uppercase tracking-widest font-sans">
            6. Assignee Information (if any)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Assignee Name / Organization" value={form.assignee_name}
              onChange={v => setForm(prev => ({ ...prev, assignee_name: v }))}
              placeholder="e.g. Hot Hands IP, LLC" />
            <EditField label="Assignee Address" value={form.assignee_address}
              onChange={v => setForm(prev => ({ ...prev, assignee_address: v }))}
              placeholder="e.g. 7601 Prentiss Ave, Lubbock TX 79424" />
          </div>
          <p className="text-xs font-sans text-gray-500 mt-1">
            Leave blank if no formal assignment has been executed. Assignment can be recorded separately with USPTO.
          </p>
        </section>

        {/* ── Section 7: Signature ────────────────────────────────────────── */}
        <section className="mb-7">
          <h2 className="text-xs font-bold border-b border-gray-600 pb-1 mb-4 uppercase tracking-widest font-sans">
            7. Signature of Applicant or Representative
          </h2>
          <p className="text-xs font-sans text-gray-500 mb-3">
            Under 37 CFR 1.4(d)(2), a typed signature in the format /Name/ satisfies electronic signature requirements.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Applicant Signature (typed)
              </label>
              <input
                type="text"
                value={form.signature}
                onChange={e => {
                  autoSigRef.current = false
                  setForm(prev => ({ ...prev, signature: e.target.value }))
                }}
                placeholder={`/${fullInvName || 'First Middle Last'}/`}
                className="w-full text-sm border-b-2 border-gray-400 bg-transparent pb-1 focus:outline-none focus:border-indigo-600 sig-field"
              />
              <p className="text-xs text-gray-400 italic mt-1 print:hidden">
                Format: /Given Middle Family/ — 37 CFR 1.4(d)(2)
              </p>
            </div>
            <EditField
              label="Date"
              value={form.signature_date}
              onChange={v => setForm(prev => ({ ...prev, signature_date: v }))}
              placeholder="MM/DD/YYYY"
            />
          </div>
          <div className="mt-3">
            <EditField
              label="Typed or Printed Name"
              value={fullInvName}
              onChange={() => {}}
              disabled
              note="Auto-populated from inventor name fields above"
            />
            <EditField
              label="Registration Number (Patent Attorney/Agent)"
              value=""
              onChange={() => {}}
              placeholder="Leave blank — pro se filer"
            />
          </div>
        </section>

        {/* Footer */}
        <div className="border-t border-gray-300 pt-4 text-xs font-sans text-gray-400 text-center">
          <p>Form {formVersion?.form_number ?? 'PTO/AIA/14'} — Generated by PatentPending.app on {today}</p>
          <p className="mt-1">
            File at <strong>patentcenter.uspto.gov</strong> · Allow 1–3 business days for confirmation receipt
          </p>
          <p className="mt-1 text-amber-600">PatentPending.app is not a law firm. This is not legal advice.</p>
        </div>
      </div>

      {/* ── Styles ─────────────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');

        .sig-field {
          font-family: 'Dancing Script', 'Brush Script MT', cursive;
          font-size: 1.35rem !important;
          font-style: italic;
          color: #1a1f36;
        }

        @media print {
          .print\\:hidden { display: none !important; }
          body { font-size: 11pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.75in; }
          input { border: none !important; border-bottom: 1px solid #333 !important; }
          .sig-field {
            font-family: 'Dancing Script', 'Brush Script MT', cursive !important;
            font-size: 1.2rem !important;
            font-style: italic;
          }
        }
      `}</style>
    </div>
  )
}
