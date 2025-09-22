import React, { useState } from 'react'

const CopyButton = ({ text, className = '' }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`p-2 rounded-lg bg-border-primary border border-border-secondary hover:bg-border-secondary transition-colors ${className} ${
        copied ? 'bg-green-500/20 border-green-500/20' : ''
      }`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? (
        <CheckIcon className="w-4 h-4 text-green-400" />
      ) : (
        <CopyIcon className="w-4 h-4 text-text-secondary" />
      )}
    </button>
  )
}

// Icon components
const CopyIcon = ({ className }) => (
  <svg viewBox="0 0 16 16" className={className}>
    <path
      d="M11 3H9a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H9V3a1 1 0 0 0 1 1Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <path
      d="M5 6h4M5 8h4M5 10h2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
)

const CheckIcon = ({ className }) => (
  <svg viewBox="0 0 16 16" className={className}>
    <path
      d="m4 8 2 2 6-6"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default CopyButton