'use client'
import { useState } from 'react'

export interface Collaborator {
  id: string
  invited_email: string
  role: 'co_inventor' | 'counsel' | 'attorney' | 'viewer'
  ownership_pct: number
  accepted_at: string | null
  created_at: string
}

interface CollaboratorsTabProps {
  patentId: string
  authToken: string
  collaborators: Collaborator[]
  onRefresh: () => void
}

const ROLE_LABELS: Record<string, string> = {
  co_inventor: 'Co-Inventor',
  counsel: 'Legal Counsel',
  attorney: 'Attorney',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  co_inventor: 'bg-purple-100 text-purple-800 border border-purple-200',
  counsel: 'bg-amber-100 text-amber-800 border border-amber-200',
  attorney: 'bg-blue-100 text-blue-800 border border-blue-200',
  viewer: 'bg-gray-100 text-gray-700 border border-gray-200',
}

export default function CollaboratorsTab({
  patentId,
  authToken,
  collaborators,
  onRefresh,
}: CollaboratorsTabProps) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'co_inventor' | 'counsel' | 'attorney' | 'viewer'>('co_inventor')
  const [ownershipPct, setOwnershipPct] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)

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
            {collaborators.map(c => (
              <div key={c.id} className="px-5 py-4 flex items-center gap-4">
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
                    {c.accepted_at ? (
                      <span className="text-xs text-green-600 font-medium">✓ Accepted</span>
                    ) : (
                      <span className="text-xs text-amber-600">Pending invite</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeCollaborator(c.id)}
                  disabled={removingId === c.id}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50"
                >
                  {removingId === c.id ? '...' : 'Remove'}
                </button>
              </div>
            ))}
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
                <option value="counsel">Legal Counsel</option>
                <option value="attorney">Attorney</option>
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
