'use client'
import React from 'react'

export interface StatusItem {
  label: string
  value?: string | number
  status?: 'ok' | 'warning' | 'error' | 'info' | 'running'
  link?: string
}

const STATUS_COLORS: Record<string, string> = {
  ok:      'bg-green-100 text-green-800 border-green-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  error:   'bg-red-100 text-red-800 border-red-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  info:    'bg-gray-100 text-gray-700 border-gray-200',
}

export function AdminPageStatus({
  items,
  lastUpdated,
  onRefresh,
}: {
  items: StatusItem[]
  lastUpdated?: Date
  onRefresh?: () => void
}) {
  const [secAgo, setSecAgo] = React.useState(0)

  React.useEffect(() => {
    if (!lastUpdated) return
    const iv = setInterval(() => {
      setSecAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [lastUpdated])

  return (
    <div className="flex items-center gap-2 mb-5 flex-wrap">
      {items.map((item, i) => {
        const cls = STATUS_COLORS[item.status ?? 'info']
        const pill = (
          <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
            {item.value != null ? <>{item.value} <span className="font-normal opacity-70">{item.label}</span></> : item.label}
          </span>
        )
        return item.link ? (
          <a key={i} href={item.link} className="hover:opacity-80 transition-opacity">{pill}</a>
        ) : pill
      })}
      {lastUpdated && (
        <span className="text-xs text-gray-400 ml-auto flex items-center gap-1.5">
          {secAgo < 60 ? `updated ${secAgo}s ago` : `updated ${Math.floor(secAgo/60)}m ago`}
          {onRefresh && (
            <button onClick={onRefresh} className="text-gray-400 hover:text-gray-600 text-xs">↻</button>
          )}
        </span>
      )}
    </div>
  )
}
