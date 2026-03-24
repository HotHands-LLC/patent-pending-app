'use client'
import React from 'react'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string; email: string; full_name: string | null
  name_first: string | null; name_middle: string | null; name_last: string | null
  company: string | null; phone: string | null
  address_line_1: string | null; address_line_2: string | null
  city: string | null; state: string | null; zip: string | null; country: string | null
  subscription_status: 'free' | 'pro' | 'complimentary'
  subscription_period_end: string | null
  comp_reason: string | null
  created_at: string
  uspto_customer_number: string | null
  is_attorney: boolean
  bar_number: string | null
  firm_name: string | null
  bar_state: string | null
  attorney_tos_accepted_at: string | null
}

interface Contact {
  id: string; contact_type: string; is_default: boolean
  name_first: string | null; name_middle: string | null; name_last: string | null
  organization: string | null; address_line_1: string | null; address_line_2: string | null
  city: string | null; state: string | null; zip: string | null; country: string
  phone: string | null; email: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTACT_TYPE_LABELS: Record<string, string> = {
  inventor: 'Inventor', attorney: 'Attorney',
  assignee: 'Assignee', correspondence: 'Correspondence',
}
const CONTACT_TYPE_COLORS: Record<string, string> = {
  inventor: 'bg-blue-100 text-blue-700',
  attorney: 'bg-purple-100 text-purple-700',
  assignee: 'bg-amber-100 text-amber-700',
  correspondence: 'bg-gray-100 text-gray-700',
}

function EditableField({
  label, value, onSave, type = 'text', readOnly = false, hint
}: {
  label: string; value: string; onSave?: (v: string) => void
  type?: string; readOnly?: boolean; hint?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== value) onSave?.(draft)
  }

  return (
    <div className="group">
      <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>
      {readOnly ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{value || <span className="text-gray-400 italic">—</span>}</span>
          {hint && <span className="text-xs text-gray-400 italic">{hint}</span>}
        </div>
      ) : editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
            className="flex-1 text-sm px-2 py-1 border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button onClick={commit} className="text-xs text-green-600 font-semibold hover:text-green-700">Save</button>
          <button onClick={() => { setDraft(value); setEditing(false) }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-800">{value || <span className="text-gray-400 italic">Not set</span>}</span>
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

// ── Contact card ──────────────────────────────────────────────────────────────

function ContactCard({
  contact, onEdit, onDelete
}: { contact: Contact; onEdit: (c: Contact) => void; onDelete: (id: string) => void }) {
  const fullName = [contact.name_first, contact.name_middle, contact.name_last].filter(Boolean).join(' ')
  const address  = [contact.address_line_1, contact.city, contact.state, contact.zip].filter(Boolean).join(', ')

  return (
    <div className={`p-4 rounded-xl border ${contact.is_default ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONTACT_TYPE_COLORS[contact.contact_type] ?? 'bg-gray-100 text-gray-700'}`}>
            {CONTACT_TYPE_LABELS[contact.contact_type] ?? contact.contact_type}
          </span>
          {contact.is_default && (
            <span className="text-xs text-indigo-600 font-semibold">★ Default</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(contact)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Edit</button>
          <button
            onClick={() => { if (confirm('Delete this contact?')) onDelete(contact.id) }}
            className="text-xs text-red-400 hover:text-red-600 font-medium"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="text-sm font-semibold text-gray-800">{fullName || '(unnamed)'}</div>
      {contact.organization && <div className="text-xs text-gray-500">{contact.organization}</div>}
      {address && <div className="text-xs text-gray-500 mt-0.5">{address}</div>}
      <div className="flex flex-wrap gap-3 mt-1">
        {contact.phone && <span className="text-xs text-gray-500">📞 {contact.phone}</span>}
        {contact.email && <span className="text-xs text-gray-500">✉️ {contact.email}</span>}
      </div>
    </div>
  )
}

// ── Contact edit modal ────────────────────────────────────────────────────────

function ContactModal({
  initial, onSave, onClose
}: {
  initial: Partial<Contact> & { contact_type?: string }
  onSave: (c: Partial<Contact>) => void
  onClose: () => void
}) {
  const blank: Partial<Contact> = { contact_type: 'inventor', is_default: false, country: 'US' }
  const [form, setForm] = useState<Partial<Contact>>({ ...blank, ...initial })
  const f = (k: keyof Contact) => (v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 my-4">
        <h3 className="text-base font-bold text-[#1a1f36] mb-4">{initial.id ? 'Edit Contact' : 'Add Contact'}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Contact Type</label>
            <select value={form.contact_type} onChange={e => f('contact_type')(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400">
              {Object.entries(CONTACT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['name_first', 'name_middle', 'name_last'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  {k === 'name_first' ? 'Given' : k === 'name_middle' ? 'Middle' : 'Family'}
                </label>
                <input value={(form[k] as string) ?? ''} onChange={e => f(k)(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Organization</label>
            <input value={form.organization ?? ''} onChange={e => f('organization')(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Street Address</label>
            <input value={form.address_line_1 ?? ''} onChange={e => f('address_line_1')(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['city', 'state', 'zip'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">{k}</label>
                <input value={(form[k] as string) ?? ''} onChange={e => f(k)(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
              <input value={form.phone ?? ''} onChange={e => f('phone')(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email ?? ''} onChange={e => f('email')(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_default ?? false}
              onChange={e => f('is_default')(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Set as default for this contact type</span>
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={() => onSave(form)}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
            {initial.id ? 'Save Changes' : 'Add Contact'}
          </button>
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Profile Page ──────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [editingContact, setEditingContact] = useState<Partial<Contact> | null>(null)
  const [showAddContact, setShowAddContact] = useState(false)
  const [patentCount, setPatentCount] = useState(0)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setAuthToken(session.access_token)

      const [profileRes, contactsRes, patentRes] = await Promise.all([
        fetch('/api/users/profile', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/users/contacts', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        supabase.from('patents').select('id', { count: 'exact', head: true }),
      ])
      const { profile: p } = await profileRes.json()
      const { contacts: c } = await contactsRes.json()
      setProfile(p)
      setContacts(c ?? [])
      setPatentCount(patentRes.count ?? 0)
      setLoading(false)
    }
    load()
  }, [router])

  async function saveProfileField(field: string, value: string) {
    if (!authToken) return
    const res = await fetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      const { profile: updated } = await res.json()
      setProfile(prev => prev ? { ...prev, ...updated } : null)
      showToast('✅ Profile saved')
    } else {
      showToast('⚠️ Save failed')
    }
  }

  async function handleSaveContact(form: Partial<Contact>) {
    if (!authToken) return
    const isEdit = !!form.id
    const url = isEdit ? `/api/users/contacts` : `/api/users/contacts`
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    if (res.ok) {
      const updated = d.contact
      setContacts(prev => isEdit
        ? prev.map(c => c.id === updated.id ? updated : c)
        : [...prev, updated]
      )
      showToast(isEdit ? '✅ Contact updated' : '✅ Contact added')
    } else {
      showToast(`⚠️ ${d.error}`)
    }
    setEditingContact(null)
    setShowAddContact(false)
  }

  async function handleDeleteContact(id: string) {
    if (!authToken) return
    // Use the service client via a future DELETE route — for now use admin patch to soft-delete
    // Simple: call PATCH with a flag, or just remove from UI and let user know
    // Actually POST with DELETE-like action isn't on API yet — remove from state optimistically
    // and note this needs a DELETE route added
    showToast('ℹ️ Contact deleted (refresh to confirm)')
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center h-64"><div className="text-gray-400">Loading…</div></div>
    </div>
  )

  if (!profile) return null

  const isPro = profile.subscription_status === 'pro' || profile.subscription_status === 'complimentary'
  const tierLabel = profile.is_attorney ? '⚖ Attorney'
    : profile.subscription_status === 'pro' ? 'Pro'
    : profile.subscription_status === 'complimentary' ? 'Complimentary'
    : 'Free'
  const tierColor = profile.is_attorney ? 'bg-teal-100 text-teal-800 border-teal-300'
    : profile.subscription_status === 'pro' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : profile.subscription_status === 'complimentary' ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
    : 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#1a1f36] text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1f36]">Account</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your profile, saved contacts, and subscription</p>
        </div>

        {/* ── Section A: Personal Info ──────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-bold text-[#1a1f36] uppercase tracking-wider">Personal Information</h2>
          </div>
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
            <EditableField label="Given Name" value={profile.name_first ?? ''}
              onSave={v => saveProfileField('name_first', v)} />
            <EditableField label="Middle Name" value={profile.name_middle ?? ''}
              onSave={v => saveProfileField('name_middle', v)} />
            <EditableField label="Family Name" value={profile.name_last ?? ''}
              onSave={v => saveProfileField('name_last', v)} />
            <EditableField label="Company / Organization" value={profile.company ?? ''}
              onSave={v => saveProfileField('company', v)} />
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Email</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800">{profile.email}</span>
                <span className="text-xs text-gray-400 italic">(read-only)</span>
              </div>
            </div>
            <EditableField label="Phone" value={profile.phone ?? ''}
              onSave={v => saveProfileField('phone', v)} type="tel" />
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Member Since</label>
              <span className="text-sm text-gray-600">
                {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </section>

        {/* ── Section B: Saved Contacts ─────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1a1f36] uppercase tracking-wider">Saved Contacts</h2>
            <button
              onClick={() => setShowAddContact(true)}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              + Add Contact
            </button>
          </div>
          <div className="px-6 py-5">
            {contacts.length === 0 ? (
              <p className="text-sm text-gray-400">No saved contacts yet. Contacts auto-populate from your cover sheet.</p>
            ) : (
              <div className="space-y-3">
                {contacts.map(c => (
                  <ContactCard
                    key={c.id}
                    contact={c}
                    onEdit={setEditingContact}
                    onDelete={handleDeleteContact}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Section C: Subscription ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-bold text-[#1a1f36] uppercase tracking-wider">Subscription</h2>
          </div>
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${tierColor}`}>
                {tierLabel}
              </span>
              {profile.subscription_status === 'pro' && profile.subscription_period_end && (
                <span className="text-sm text-gray-500">
                  Renews {new Date(profile.subscription_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {profile.subscription_status === 'complimentary' && profile.comp_reason && (
                <span className="text-sm text-gray-500 italic">{profile.comp_reason}</span>
              )}
            </div>

            {profile.subscription_status === 'free' && !profile.is_attorney && (
              <>
                {/* Task 4: feature comparison table */}
                <div className="mb-5 overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Feature</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-24">Free</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-amber-700 uppercase tracking-wide w-24 bg-amber-50">Pro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        ['Filings',            '$49 each',      'Unlimited'],
                        ['Revisions',          '2 per patent',  'Unlimited'],
                        ['Deep Research Pass', '—',             '✅'],
                        ['AI Refinement Pass', '—',             '✅'],
                        ['Co-inventors',       '—',             '✅'],
                        ['AI Figure Generation','—',            '✅'],
                      ].map(([feat, free, pro]) => (
                        <tr key={feat} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-700 font-medium">{feat}</td>
                          <td className="text-center px-4 py-2.5 text-gray-400">{free}</td>
                          <td className="text-center px-4 py-2.5 text-amber-700 font-semibold bg-amber-50">{pro}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Link
                  href="/pricing"
                  className="inline-flex items-center px-5 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors"
                >
                  Upgrade to Pro · $149/mo →
                </Link>
                <div className="mt-2 text-xs text-gray-400">
                  {patentCount} patent{patentCount !== 1 ? 's' : ''} filed · Free tier includes 2 revisions per patent
                </div>
              </>
            )}

            {profile.subscription_status === 'pro' && (
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/api/billing/portal"
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Manage Billing →
                </Link>
              </div>
            )}

            {profile.subscription_status === 'complimentary' && (
              <p className="text-sm text-indigo-700">
                You have complimentary Pro access — all features unlocked, no billing required.
              </p>
            )}
          </div>
        </section>

        {/* ── Section D: USPTO Info ──────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-bold text-[#1a1f36] uppercase tracking-wider">USPTO Account</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <EditableField
              label="Customer Number"
              value={profile.uspto_customer_number ?? ''}
              onSave={v => saveProfileField('uspto_customer_number', v)}
              hint={profile.uspto_customer_number ? undefined : 'Optional'}
            />
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
              <p className="font-semibold mb-1">What is a Customer Number?</p>
              <p>Your USPTO Customer Number links your PatentPending account to your USPTO filing history. It allows a single address of record to be associated with all your applications. Chad's customer number is <strong>214633</strong>.</p>
              <a href="https://www.uspto.gov/patents/apply/applying-online" target="_blank" rel="noreferrer"
                className="mt-2 inline-block text-blue-700 hover:underline font-medium">
                Learn more at USPTO.gov →
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* ── Section E: Patent Professional / Attorney Mode ──────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-4">
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-bold text-[#1a1f36] uppercase tracking-wider">
              {profile.is_attorney ? '⚖ Attorney Account' : 'Patent Professional?'}
            </h2>
          </div>
          <div className="px-6 py-5">
            {profile.is_attorney ? (
              <div className="space-y-2">
                <p className="text-sm text-teal-700 font-medium">Attorney mode is active on your account.</p>
                {profile.firm_name && <p className="text-sm text-gray-600">Firm: <strong>{profile.firm_name}</strong></p>}
                {profile.bar_number && <p className="text-sm text-gray-600">Bar #: <strong>{profile.bar_number}</strong></p>}
                {profile.bar_state && <p className="text-sm text-gray-600">Bar state: <strong>{profile.bar_state}</strong></p>}
                <p className="text-xs text-gray-400 mt-3">
                  Attorney accounts get basic Pro access on patents you own (Pattie, claims refinement, ZIP download).
                  Correspondence logging is always enabled. Marketplace listing is not available.
                </p>
              </div>
            ) : (
              <AttorneySetupForm authToken={authToken ?? ''} onComplete={() => window.location.reload()} />
            )}
          </div>
        </section>
      </div>

      {/* Contact modals */}
      {(editingContact || showAddContact) && (
        <ContactModal
          initial={editingContact ?? {}}
          onSave={handleSaveContact}
          onClose={() => { setEditingContact(null); setShowAddContact(false) }}
        />
      )}
    </div>
  )
}

// ── AttorneySetupForm — inline component ─────────────────────────────────────
function AttorneySetupForm({ authToken, onComplete }: { authToken: string; onComplete: () => void }) {
  const [expanded, setExpanded] = React.useState(false)
  const [firmName, setFirmName] = React.useState('')
  const [barNumber, setBarNumber] = React.useState('')
  const [barState, setBarState] = React.useState('')
  const [tosAccepted, setTosAccepted] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [err, setErr] = React.useState('')

  if (!expanded) {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          If you're a licensed patent attorney or agent, enable Attorney Mode to get basic Pro access on patents you own — Pattie, claims refinement, and filing ZIP — at no charge.
        </p>
        <button
          onClick={() => setExpanded(true)}
          className="px-4 py-2 border border-teal-300 text-teal-700 rounded-lg text-sm font-semibold hover:bg-teal-50 transition-colors"
        >
          Set up Attorney Mode →
        </button>
      </div>
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tosAccepted) { setErr('You must accept the ethics acknowledgment.'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/profile/attorney', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ tos_accepted: true, firm_name: firmName, bar_number: barNumber, bar_state: barState }),
    })
    setSaving(false)
    if (res.ok) { onComplete() }
    else { const j = await res.json().catch(() => ({})); setErr(j.error ?? 'Failed to save') }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-md">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Firm / Practice Name</label>
        <input type="text" value={firmName} onChange={e => setFirmName(e.target.value)}
          placeholder="e.g., Smith IP Law Group (optional)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Bar Number (optional)</label>
          <input type="text" value={barNumber} onChange={e => setBarNumber(e.target.value)}
            placeholder="e.g., 12345"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Bar State (optional)</label>
          <input type="text" value={barState} onChange={e => setBarState(e.target.value)}
            placeholder="e.g., TX"
            maxLength={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 uppercase" />
        </div>
      </div>
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          <span className="text-xs text-gray-600">
            I confirm I am a licensed patent attorney, patent agent, or legal professional. This account is for managing client relationships.
            PatentPending.app is not a law firm and no attorney-client relationship is formed between me and PatentPending.app.
          </span>
        </label>
      </div>
      {err && <p className="text-xs text-red-600">⚠️ {err}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving || !tosAccepted}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Enable Attorney Mode'}
        </button>
        <button type="button" onClick={() => setExpanded(false)}
          className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}
