'use client'

export default function PattieCTAButton() {
  const handleClick = () => {
    const el = document.querySelector<HTMLButtonElement>('[aria-label="Open Pattie chat"]')
    el?.click()
  }

  return (
    <button
      onClick={handleClick}
      className="inline-block px-8 py-4 border border-gray-300 text-gray-700 rounded-lg font-semibold text-lg hover:border-indigo-400 hover:text-indigo-700 transition-colors"
    >
      Try Pattie free ↗
    </button>
  )
}
