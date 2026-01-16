'use client'

import Link from 'next/link'
import { Flower, Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
              <Flower className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-slate-900">
              Floropolis
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/valentines" className="text-emerald-600 hover:text-emerald-700 transition-colors font-semibold">
              Valentine's Day 🌹
            </Link>
            <Link href="/how-it-works" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              How It Works
            </Link>
            <Link href="/about" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              About
            </Link>
            <Link href="/contact" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              Contact
            </Link>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <a href="https://shop.floropolis.com/762172" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              Log In
            </a>
            <a href="https://shop.floropolis.com/762172" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg">
              Shop Now
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-slate-700 hover:text-emerald-600 transition-colors p-2"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-3 border-t border-slate-200">
            <Link 
              href="/valentines" 
              className="block px-4 py-2 text-emerald-600 hover:bg-emerald-50 transition-colors rounded-lg font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Valentine's Day 🌹
            </Link>
            <Link 
              href="/sample-box" 
              className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Free Sample Box
            </Link>
            <Link 
              href="/how-it-works" 
              className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              How It Works
            </Link>
            <Link 
              href="/about" 
              className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </Link>
            <Link 
              href="/contact" 
              className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Contact
            </Link>
            <a 
              href="https://shop.floropolis.com/762172" 
              className="block mx-4 px-4 py-3 text-center bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Shop Now
            </a>
          </div>
        )}
      </div>
    </nav>
  )
}
