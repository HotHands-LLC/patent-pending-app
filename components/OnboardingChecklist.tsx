'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface ChecklistItem {
  id: string
  label: string
  done: boolean
  href?: string
}

export default function OnboardingChecklist({ patentCount }: { patentCount: number }) {
  const [open, setOpen] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [intentDone, setIntentDone] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem('onboarding_dismissed') === '1')
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('patent_profiles').select('onboarding_intent, onboarding_step').eq('id', user.id).single()
        .then(({ data }) => { if (data?.onboarding_intent) setIntentDone(true) })
    })
  }, [])

  const items: ChecklistItem[] = [
    { id: 'account', label: 'Create your account', done: true },
    { id: 'intent', label: 'Tell Pattie about your goal', done: intentDone, href: '/welcome' },
    { id: 'patent', label: 'Add your first invention', done: patentCount > 0, href: '/dashboard/patents/new' },
    { id: 'draft', label: 'Review your patent draft', done: patentCount > 0, href: '/dashboard/patents' },
    { id: 'readiness', label: 'Check your filing readiness', done: false, href: '/dashboard/patents' },
  ]

  const completedCount = items.filter(i => i.done).length
  const allDone = completedCount === items.length

  if (dismissed || allDone) return null

  return (
    <div className="fixed top-20 right-4 z-30 w-64 bg-white rounded-xl border border-indigo-200 shadow-lg overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-indigo-900">🚀 Getting Started</span>
          <span className="text-xs text-indigo-600 font-semibold">{completedCount}/{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen(o => !o)} className="text-indigo-400 hover:text-indigo-700 text-lg leading-none">
            {open ? '▲' : '▼'}
          </button>
          <button onClick={() => { setDismissed(true); localStorage.setItem('onboarding_dismissed','1') }}
            className="text-indigo-300 hover:text-indigo-600 text-base leading-none">✕</button>
        </div>
      </div>
      {open && (
        <div className="px-4 py-3 space-y-2">
          {items.map(item => (
            <div key={item.id} className={`flex items-center gap-2 ${item.done ? 'opacity-60' : ''}`}>
              <span className={`text-sm shrink-0 ${item.done ? 'text-green-500' : 'text-gray-300'}`}>
                {item.done ? '✅' : '○'}
              </span>
              {!item.done && item.href ? (
                <Link href={item.href} className="text-xs text-[#1a1f36] hover:text-indigo-600 hover:underline">{item.label}</Link>
              ) : (
                <span className={`text-xs ${item.done ? 'line-through text-gray-400' : 'text-[#1a1f36]'}`}>{item.label}</span>
              )}
            </div>
          ))}
          {!items[2].done && (
            <Link href="/dashboard/patents/new"
              className="mt-3 block text-center px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors">
              Continue →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
