'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/admin/mission-control', label: '🎯 Mission Control' },
  { href: '/admin',                 label: '📊 Dashboard'       },
  { href: '/admin/blog',            label: '📝 Blog'            },
  { href: '/admin/marketing',       label: '📣 Marketing'       },
  { href: '/admin/claw-queue',      label: '⚡ Queue'           },
  { href: '/admin/crons',           label: '⏰ Crons'           },
  { href: '/admin/research',        label: '🔬 Research'        },
]

export default function AdminSubNav() {
  const pathname = usePathname()

  return (
    <div className="w-full bg-[#0f172a] border-b border-white/10 overflow-x-auto">
      <div className="flex items-center px-2 h-9 min-w-max">
        {NAV_LINKS.map(link => {
          // Exact match for admin root, prefix match for others
          const isActive = link.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 h-full flex items-center text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? 'text-white border-[#f5a623]'
                  : 'text-white/50 border-transparent hover:text-white/80 hover:border-white/20'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
