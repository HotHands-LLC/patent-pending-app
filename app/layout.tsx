import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PatentPending — File your patent. Keep your idea.',
  description: 'AI-powered patent filing for independent inventors. Draft claims, generate specs, and file your own provisional patent — no attorney required.',
  manifest: '/manifest.json',
  themeColor: '#4f46e5',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'PatentPending' },
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 1 },
  openGraph: {
    title: 'patentpending.app — File your patent. Keep your idea.',
    description: 'Independent inventors: protect your ideas without paying $10K in legal fees.',
    url: 'https://patentpending.app',
    siteName: 'patentpending.app',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'patentpending.app', description: 'File your own patent. No attorney needed.' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  )
}
