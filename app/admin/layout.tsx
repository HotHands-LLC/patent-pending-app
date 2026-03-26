'use client'
import AdminPulseBar from '@/components/AdminPulseBar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <AdminPulseBar />
      <div className="flex-1">{children}</div>
    </div>
  )
}
