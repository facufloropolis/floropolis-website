'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const GOOGLE_SCRIPT_URL = 'https://script.google.com/a/macros/floropolis.com/s/AKfycbx9xMMu0u_CCuh7TTD0d45HBYK05YwjV1jZeKzyk4tCApGuedSQvVQFAistwAEPIOmY/exec'

export default function EmailPopup() {
  const [isVisible, setIsVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false)

  useEffect(() => {
    // Check if already dismissed in this session
    if (sessionStorage.getItem('emailPopupDismissed')) {
      setHasBeenDismissed(true)
      return
    }

    // Check if already submitted
    if (localStorage.getItem('emailPopupSubmitted')) {
      setHasBeenDismissed(true)
      return
    }

    let hasTriggered = false

    // Timer trigger: 10 seconds
    const timer = setTimeout(() => {
      if (!hasTriggered && !hasBeenDismissed) {
        setIsVisible(true)
        hasTriggered = true
      }
    }, 10000)

    // Scroll trigger: 50% of page
    const handleScroll = () => {
      if (hasTriggered || hasBeenDismissed) return
      
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      
      if (scrollPercent >= 50) {
        setIsVisible(true)
        hasTriggered = true
      }
    }

    window.addEventListener('scroll', handleScroll)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [hasBeenDismissed])

  const handleClose = () => {
    setIsVisible(false)
    setHasBeenDismissed(true)
    sessionStorage.setItem('emailPopupDismissed', 'true')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || isSubmitting) return

    setIsSubmitting(true)

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'email_popup_10off',
          page_url: window.location.href + '?utm_source=email_popup&utm_medium=popup&utm_campaign=10off'
        })
      })

      setIsSubmitted(true)
      localStorage.setItem('emailPopupSubmitted', 'true')
      
      // Auto close after 3 seconds
      setTimeout(() => {
        setIsVisible(false)
      }, 3000)

    } catch (error) {
      console.error('Submission error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 relative shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close popup"
        >
          <X className="w-6 h-6" />
        </button>

        {!isSubmitted ? (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">🌹</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Get 10% Off Your First Order
              </h2>
              <p className="text-slate-600">
                Join 500+ florists getting farm-fresh flowers at wholesale prices.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : 'Get My 10% Discount'}
              </button>
            </form>

            <p className="text-xs text-slate-500 text-center mt-4">
              No spam. Unsubscribe anytime.
            </p>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              You're In!
            </h2>
            <p className="text-slate-600">
              Check your email for your 10% discount code.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}