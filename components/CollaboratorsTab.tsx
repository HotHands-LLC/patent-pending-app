'use client'
import { useState, useEffect } from 'react'

export interface Collaborator {
  id: string
  invited_email: string
  role: 'co_inventor' | 'legal_counsel' | 'agency' | 'viewer'
  ownership_pct: number
  accepted_at: string | null
  created_at: string
  can_edit: boolean
  is_ghost?: boolean  // accepted but never signed in
}

interface CollaboratorsTabProps {
  patentId: string
  authToken: string
  collaborators: Collaborator[]
  onRefresh: () => void
  isOwner?: boolean  // only owner can toggle can_edit
}

const ROLE_LABELS: Record<string, string> = {
  co_inventor: 'Co-Inventor',
  legal_counsel: 'Legal Counsel',
  agency: 'Agency',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  co_inventor: 'bg-purple-100 text-purple-800 border border-purple-200',
  legal_counsel: 'bg-amber-100 text-amber-800 border border-amber-200',
  agency: 'bg-blue-100 text-blue-800 border border-blue-200',
  viewer: 'bg-gray-100 text-gray-700 border border-gray-200',
}

const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000

function isExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > INVITE_EXPIRY_MS
}

function expiryLabel(createdAt: string): string {
  const expiresAt = new Date(createdAt).getTime() + INVITE_EXPIRY_MS
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'Expired'
  const h = Math.floor(remaining / 3600000)
  const m = Math.floor((remaining % 3600000) / 60000)
  return h > 0 ? `Expires in ${h}h ${m}m` : `Expires in ${m}m`
}

export default function CollaboratorsTab({
  patentId,
  authToken,
  collaborators,
  onRefresh,
  isOwner = false,
}: CollaboratorsTabProps) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'co_inventor' | 'legal_counsel' | 'agency' | 'viewer'>('co_inventor')
  const [ownershipPct, setOwnershipPct] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [resendMsg, setResendMsg] = useState<Record<string, string>>({})
  const [togglingEdit, setTogglingEdit] = useState<string | null>(null)
  // Tick every minute to keep expiry countdown live
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  async function sendInvite() {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      setInviteMsg('Enter a valid email address')
      return
    }
    setSending(true)
    setInviteMsg('')
    try {
      const res = await fetch(`/api/patents/${patentId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          invited_email: inviteEmail,
          role: inviteRole,
          ownership_pct: parseFloat(ownershipPct) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInviteMsg(data.error ?? 'Failed to send invite')
      } else {
        setInviteMsg('✅ Invite sent!')
        setInviteEmail('')
        setOwnershipPct('')
        onRefresh()
      }
    } catch {
      setInviteMsg('Network error — try again')
    } finally {
      setSending(false)
    }
  }

  async function removeCollaborator(collabId: string) {
    if (!confirm('Remove this collaborator? They will lose access to this patent.')) return
    setRemovingId(collabId)
    try {
      await fetch(`/api/patents/${patentId}/invite?collaborator_id=${collabId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      onRefresh()
    } finally {
      setRemovingId(null)
    }
  }

  async function toggleCanEdit(collabId: string, currentValue: boolean) {
    setTogglingEdit(collabId)
    try {
      await fetch(`/api/patents/${patentId}/collaborators/${collabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ can_edit: !currentValue }),
      })
      onRefresh()
    } finally {
      setTogglingEdit(null)
    }
  }

  async function resendInvite(collabId: string, email: string) {
    setResendingId(collabId)
    setResendMsg(prev => ({ ...prev, [collabId]: '' }))
    try {
      const res = await fetch(`/api/patents/${patentId}/resend-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ collaborator_id: collabId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResendMsg(prev => ({ ...prev, [collabId]: data.error ?? 'Failed to resend' }))
      } else {
        setResendMsg(prev => ({ ...prev, [collabId]: `✅ Resent to ${email}` }))
        onRefresh()
      }
    } catch {
      setResendMsg(prev => ({ ...prev, [collabId]: 'Network error — try again' }))
    } finally {
      setResendingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Collaborators list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Collaborators ({collaborators.length})
          </span>
        </div>

        {collaborators.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            No collaborators yet. Invite a co-inventor below.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {collaborators.map(c => {
              const pending = !c.accepted_at
              const expired = pending && isExpired(c.created_at)
              const needsResend = (pending && expired) || c.is_ghost
              return (
                <div key={c.id} className="px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 flex-shrink-0">
                      {c.invited_email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{c.invited_email}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ROLE_COLORS[c.role]}`}>
                          {ROLE_LABELS[c.role]}
                        </span>
                        {c.ownership_pct > 0 && (
                          <span className="text-xs text-gray-400">{c.ownership_pct}% ownership</span>
                        )}
                        {c.is_ghost ? (
                          <span className="text-xs text-orange-600 font-medium" title="Account created but user has never signed in">⚠️ Ghost — never signed in</span>
                        ) : c.accepted_at ? (
                          <span className="text-xs text-green-600 font-medium">✓ Active</span>
                        ) : expired ? (
                          <span className="text-xs text-red-500 font-medium">⏰ Expired</span>
                        ) : (
                          <span className="text-xs text-amber-600">
                            Pending — {expiryLabel(c.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Can Edit toggle — owner only, accepted collaborators only */}
                      {isOwner && c.accepted_at && !c.is_ghost && (
                        <div className="flex items-center gap-1.5" title={c.can_edit ? 'Can edit — click to revoke' : 'Read-only — click to grant edit access'}>
                          <span className="text-xs text-gray-400">Edit</span>
                          <button
                            onClick={() => toggleCanEdit(c.id, c.can_edit)}
                            disabled={togglingEdit === c.id}
                            aria-label={`Toggle edit access for ${c.invited_email}`}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                              c.can_edit ? 'bg-indigo-600' : 'bg-gray-200'
                            } ${togglingEdit === c.id ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:opacity-90'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${c.can_edit ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      )}
                      {needsResend && (
                        <button
                          onClick={() => resendInvite(c.id, c.invited_email)}
                          disabled={resendingId === c.id}
                          className="text-xs text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50 font-medium"
                        >
                          {resendingId === c.id ? '...' : 'Resend Invite →'}
                        </button>
                      )}
                      <button
                        onClick={() => removeCollaborator(c.id)}
                        disabled={removingId === c.id}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {removingId === c.id ? '...' : 'Remove'}
                      </button>
                    </div>
                  </div>
                  {resendMsg[c.id] && (
                    <p className={`text-xs mt-1.5 pl-13 ${resendMsg[c.id].startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
                      {resendMsg[c.id]}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invite form */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Invite Collaborator</span>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="coinventor@example.com"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="co_inventor">Co-Inventor</option>
                <option value="legal_counsel">Legal Counsel</option>
                <option value="agency">Agency</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Ownership % (optional)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={ownershipPct}
                onChange={e => setOwnershipPct(e.target.value)}
                placeholder="e.g. 90"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {inviteRole === 'co_inventor' && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Co-inventors get read-only access — they can view all tabs but cannot approve claims, request revisions, make payments, or invite others.
            </div>
          )}
          {inviteRole === 'agency' && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Marketing, partnership, or external contacts — view-only on non-sensitive tabs.
            </div>
          )}

          {inviteMsg && (
            <div className={`text-sm ${inviteMsg.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
              {inviteMsg}
            </div>
          )}

          <button
            onClick={sendInvite}
            disabled={sending || !inviteEmail}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending...' : 'Send Invite →'}
          </button>
        </div>
      </div>
    </div>
  )
}
