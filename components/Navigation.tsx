'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X, ShoppingBag } from 'lucide-react'
import { useState, useEffect } from 'react'
import HeaderSearch from '@/components/HeaderSearch'
import { getItemCount } from '@/lib/quote-cart'

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    const updateCount = () => setCartCount(getItemCount());
    updateCount();
    window.addEventListener('quote-cart-updated', updateCount);
    return () => window.removeEventListener('quote-cart-updated', updateCount);
  }, []);

  return (
    <>
    <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
            <Image
              src="/Floropolis-logo-only.png"
              alt="Floropolis"
              width={200}
              height={60}
              className="h-16 w-auto"
              priority
            />
          </Link>

          {/* Search — desktop: between logo and links; mobile: in bar, expands full-width when focused */}
          <div className="hidden md:flex flex-1 min-w-0 justify-center max-w-xl">
            <HeaderSearch />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/how-it-works" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              How It Works
            </Link>
            <Link href="/shop" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              Shop
            </Link>
            <Link href="/about" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              About Us
            </Link>
            <Link href="/contact" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              Contact Us
            </Link>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/quote" className="relative flex items-center gap-1 text-slate-700 hover:text-emerald-600 transition-colors p-2" aria-label="Quote cart">
              <ShoppingBag className="h-5 w-5" />
              <span className="text-sm font-medium hidden sm:inline">Quote</span>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
            <Link href="/shop" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg">
              Shop
            </Link>
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-emerald-600 transition-colors text-xs font-medium whitespace-nowrap"
            >
              Client Login
            </a>
          </div>

          {/* Mobile: search + cart + menu button */}
          <div className="md:hidden flex items-center gap-1 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <HeaderSearch />
            </div>
            <Link href="/quote" className="relative flex items-center gap-1 text-slate-700 hover:text-emerald-600 transition-colors p-2.5" aria-label="Quote cart">
              <ShoppingBag className="h-5 w-5" />
              <span className="text-xs font-medium">Quote</span>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-emerald-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-slate-700 hover:text-emerald-600 transition-colors p-2.5"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-3 border-t border-slate-200">
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website"
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 text-slate-500 hover:bg-slate-50 hover:text-emerald-600 transition-colors rounded-lg font-medium text-sm"
              onClick={() => setMobileMenuOpen(false)}
            >
              Client Login →
            </a>
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
              About Us
            </Link>
            <Link
              href="/contact"
              className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Contact Us
            </Link>
            <Link
              href="/shop"
              className="block mx-4 px-4 py-3 text-center bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Shop
            </Link>
          </div>
        )}
      </div>
    </nav>
    </>
  )
}
