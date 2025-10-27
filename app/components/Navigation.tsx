'use client'

import Link from 'next/link'
import { Flower } from 'lucide-react'

export default function Navigation() {
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

          <div className="hidden md:flex items-center gap-8">
            <Link href="/pricing" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              Pricing
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

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              Log In
            </Link>
            <Link href="/register" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg">
              Register
            </Link>
          </div>

        </div>
      </div>
    </nav>
  )
}
