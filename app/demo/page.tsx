import type { Metadata } from 'next'
import DemoClient from './DemoClient'

export const metadata: Metadata = {
  title: 'Pattie Demo | PatentPending',
  description: 'Talk to Pattie — the AI patent assistant. Ask anything about patent filing, management, or the PatentPending platform.',
}

export default function DemoPage() {
  return <DemoClient />
}
