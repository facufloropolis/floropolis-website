'use client'

import { useState, useEffect } from 'react'
import { X, Gift, Percent } from 'lucide-react'
import Link from 'next/link'

const GOOGLE_SCRIPT_URL = 'https://script.google.com/a/macros/floropolis.com/s/AKfycbx9xMMu0u_CCuh7TTD0d45HBYK05YwjV1jZeKzyk4tCApGuedSQvVQFAistwAEPIOmY/exec'

export default function ExitIntentPopup() {
  const [isVisible, setIsVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [selectedOption, setSelectedOption] = useState<'discount' | 'sample' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  useEffect(() => {
    // Check if already shown or submitted - if so, don't set up listener at all
    if (sessionStorage.getItem('exitPopupShown') || localStorage.getItem('exitPopupSubmitted')) {
      return
    }

    let handleMouseLeave: ((e: MouseEvent) => void) | null = null
    let timer: NodeJS.Timeout | null = null

    handleMouseLeave = (e: MouseEvent) => {
      // Only trigger when mouse leaves through the top of the viewport
      if (e.clientY <= 0) {
        setIsVisible(true)
        sessionStorage.setItem('exitPopupShown', 'true')
        // Remove listener immediately after triggering
        if (handleMouseLeave) {
          document.removeEventListener('mouseleave', handleMouseLeave)
        }
      }
    }

    // Small delay before enabling exit intent detection
    timer = setTimeout(() => {
      if (handleMouseLeave) {
        document.addEventListener('mouseleave', handleMouseLeave)
      }
    }, 5000)

    return () => {
      if (timer) {
        clearTimeout(timer)
      }
      if (handleMouseLeave) {
        document.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    // Mark as shown so it won't trigger again
    sessionStorage.setItem('exitPopupShown', 'true')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !selectedOption || isSubmitting) return

    setIsSubmitting(true)

    try {
      const source = selectedOption === 'discount' ? 'exit_popup_20off' : 'exit_popup_sample'
      const utmCampaign = selectedOption === 'discount' ? '20off' : 'samplebox'
      
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source,
          page_url: window.location.href + `?utm_source=exit_popup&utm_medium=popup&utm_campaign=${utmCampaign}`
        })
      })

      setIsSubmitted(true)
      localStorage.setItem('exitPopupSubmitted', 'true')
      
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

  // Don't render if already submitted or dismissed
  if (!isVisible || localStorage.getItem('exitPopupSubmitted') === 'true') {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-8 relative shadow-2xl">
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
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Wait! Don't Leave Empty-Handed
              </h2>
              <p className="text-slate-600">
                Choose your exclusive offer before you go:
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                type="button"
                onClick={() => setSelectedOption('discount')}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  selectedOption === 'discount'
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-emerald-300'
                }`}
              >
                <Percent className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                <div className="font-bold text-slate-900">20% Off</div>
                <div className="text-sm text-slate-600">First order discount</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOption('sample')}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  selectedOption === 'sample'
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-emerald-300'
                }`}
              >
                <Gift className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                <div className="font-bold text-slate-900">Free Sample</div>
                <div className="text-sm text-slate-600">Try before you buy</div>
              </button>
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
                disabled={isSubmitting || !selectedOption}
                className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : selectedOption === 'discount' ? 'Get My 20% Discount' : 'Request Sample Box'}
              </button>
            </form>

            <p className="text-xs text-slate-500 text-center mt-4">
              No spam. Unsubscribe anytime.
            </p>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {selectedOption === 'discount' ? 'Discount Coming!' : 'Sample Request Received!'}
            </h2>
            <p className="text-slate-600 mb-4">
              {selectedOption === 'discount' 
                ? 'Check your email for your 20% discount code.'
                : "We'll reach out within 24 hours to arrange your free sample box."
              }
            </p>
            {selectedOption === 'sample' && (
              <Link 
                href="/sample-box"
                className="text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Or fill out the full sample request form →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}