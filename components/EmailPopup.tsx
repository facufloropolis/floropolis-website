'use client'

// ============================================================================
// EmailPopup — timers loosened 2026-05-19 (Audit #57).
//
// Prior behavior: desktop 15s, mobile 45s. Audit found 15s on desktop was too
// aggressive (the original file comment already noted 10s caused bounces).
// Current behavior: desktop 60s, mobile 90s. Scroll-50% trigger preserved.
// Session cap: once shown OR dismissed in a session, do not re-trigger.
// ============================================================================

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { pushEvent } from '@/lib/gtm'
import { useAuth } from '@/lib/auth-context'

const GOOGLE_SCRIPT_URL = 'https://script.google.com/a/macros/floropolis.com/s/AKfycbx9xMMu0u_CCuh7TTD0d45HBYK05YwjV1jZeKzyk4tCApGuedSQvVQFAistwAEPIOmY/exec'

export default function EmailPopup() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [isVisible, setIsVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false)

  useEffect(() => {
    // Session-cap check (Audit #57, 2026-05-19): once shown OR dismissed
    // OR submitted in this session, do not show again. Uses the existing
    // `emailPopupDismissed` key plus a new `email_popup_shown` key for the
    // "already opened, then user navigated" case (prior code only capped on
    // explicit dismiss, so an SPA route change could re-trigger).
    if (
      sessionStorage.getItem('emailPopupDismissed') ||
      sessionStorage.getItem('email_popup_shown')
    ) {
      setHasBeenDismissed(true)
      return
    }

    // Check if already submitted (persisted across sessions)
    if (localStorage.getItem('emailPopupSubmitted')) {
      setHasBeenDismissed(true)
      return
    }

    let hasTriggered = false

    const markShown = (trigger: 'timer' | 'scroll') => {
      setIsVisible(true)
      hasTriggered = true
      sessionStorage.setItem('email_popup_shown', '1')
      pushEvent('email_popup_shown', { trigger, page: window.location.pathname })
    }

    // Timer trigger (Audit #57, 2026-05-19): desktop 60s (was 15s),
    // mobile 90s (was 45s). Both interrupts loosened to reduce bounce.
    const isMobile = window.innerWidth < 768
    const timer = setTimeout(() => {
      if (!hasTriggered && !hasBeenDismissed) {
        markShown('timer')
      }
    }, isMobile ? 90000 : 60000)

    // Scroll trigger: 50% of page (unchanged — high-intent signal)
    const handleScroll = () => {
      if (hasTriggered || hasBeenDismissed) return

      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100

      if (scrollPercent >= 50) {
        markShown('scroll')
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
    pushEvent('email_popup_dismissed', { page: pathname ?? '/' })
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
      pushEvent('email_popup_submitted', { page: pathname ?? '/' })
      
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

  // Don't show if logged in — they're already a client, we have their email
  if (user) return null

  // Don't show on conversion pages or auth flows — user is already in a funnel
  const SUPPRESS_PATHS = ['/sample-box', '/quote', '/auth', '/account', '/checkout', '/signup', '/order-confirmation', '/admin']
  if (SUPPRESS_PATHS.some(p => pathname?.startsWith(p))) return null

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
                Join florists getting farm-fresh wholesale flowers — direct from Ecuador.
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