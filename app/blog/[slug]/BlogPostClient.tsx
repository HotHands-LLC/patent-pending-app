'use client'

import ReactMarkdown from 'react-markdown'

interface Props {
  bodyMd: string
}

export default function BlogPostClient({ bodyMd }: Props) {
  return (
    <div className="prose prose-gray max-w-none prose-headings:font-semibold prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm">
      <ReactMarkdown>{bodyMd}</ReactMarkdown>
    </div>
  )
}
