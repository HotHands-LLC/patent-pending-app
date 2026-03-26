import type { ReactNode } from 'react'
import AdminPulseBar from '@/components/AdminPulseBar'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminPulseBar />
      <div className="pt-9">{children}</div>
    </>
  )
}
