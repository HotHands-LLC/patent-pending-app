'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const INTENTS = [
  { id: 'idea', emoji: '💡', label: 'I have an invention idea I want to protect', route: '/dashboard/patents/new' },
  { id: 'provisional_filed', emoji: '📋', label: 'I already filed a provisional — I need help with the non-provisional', route: '/dashboard/patents/new' },
  { id: 'exploring', emoji: '🔍', label: "I'm exploring — not sure if my idea is patentable", route: '/demo' },
  { id: 'attorney', emoji: '🏢', label: "I'm an attorney or agent helping a client", route: '/dashboard' },
]

export default function WelcomePage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('there')
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'
      setFirstName(name)
    })
  }, [router])

  async function handleContinue() {
    if (!selected) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('patent_profiles').upsert({ id: user.id, intent: selected }, { onConflict: 'id' })
    }
    const intent = INTENTS.find(i => i.id === selected)
    router.push(intent?.route ?? '/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-black mx-auto mb-4">PP</div>
          <h1 className="text-2xl font-bold text-[#1a1f36] mb-2">
            Hi {firstName}! I'm Pattie, your patent assistant. 🦞
          </h1>
          <p className="text-gray-500 text-sm">Let's get started. What best describes you?</p>
        </div>

        <div className="space-y-3 mb-6">
          {INTENTS.map(intent => (
            <button key={intent.id} onClick={() => setSelected(intent.id)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selected === intent.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30'
              }`}>
              <span className="text-xl mr-3">{intent.emoji}</span>
              <span className="text-sm font-medium text-[#1a1f36]">{intent.label}</span>
            </button>
          ))}
        </div>

        <button onClick={handleContinue} disabled={!selected || saving}
          className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors text-sm">
          {saving ? 'Setting up your workspace…' : 'Continue →'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          <button onClick={() => router.push('/dashboard')} className="hover:underline">
            Skip for now →
          </button>
        </p>
      </div>
    </div>
  )
}
