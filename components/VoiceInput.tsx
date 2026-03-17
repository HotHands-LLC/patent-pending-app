'use client'

/**
 * VoiceInput — reusable Web Speech API mic button.
 * Gracefully hidden when browser doesn't support SpeechRecognition.
 * Auto-submits after 1.5s pause in speech.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  onAutoSubmit?: (text: string) => void
  disabled?: boolean
}

// Declare SpeechRecognition types (browser API, not in standard TS lib)
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
}

export default function VoiceInput({ onTranscript, onAutoSubmit, disabled }: VoiceInputProps) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptRef = useRef('')

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition ?? window.webkitSpeechRecognition
    setSupported(!!SpeechRecognitionAPI)
    return () => {
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current)
    }
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) return

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          finalTranscript += text
        } else {
          interimTranscript += text
        }
      }

      const current = finalTranscript || interimTranscript
      transcriptRef.current = current
      onTranscript(current)

      // Auto-submit after 1.5s pause on final result
      if (finalTranscript) {
        if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current)
        autoSubmitTimerRef.current = setTimeout(() => {
          if (finalTranscript.trim() && onAutoSubmit) {
            onAutoSubmit(finalTranscript.trim())
          }
          stopListening()
        }, 1500)
      }
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn('[VoiceInput] error:', event.error)
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [onTranscript, onAutoSubmit, stopListening])

  const toggle = useCallback(() => {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }, [listening, startListening, stopListening])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? 'Stop recording' : 'Speak your question'}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
      className={`p-2.5 rounded-xl transition-all shrink-0 ${
        listening
          ? 'bg-red-100 text-red-600 animate-pulse'
          : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
      } disabled:opacity-40`}
    >
      {listening ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  )
}
