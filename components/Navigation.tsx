'use client'
// Navigation — v2 | 2026-03-23 | Job_PM
// Auth widget upgraded: shows profile-aware avatar + dropdown when signed in.
// Replaces old isSignedIn+getSession pattern with useAuth from AuthProvider.

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, ShoppingBag, ShoppingCart, User, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import HeaderSearch from '@/components/HeaderSearch'
import { getItemCount } from '@/lib/quote-cart'
import { buyNowCartCount, BUY_NOW_CART_EVENT } from '@/lib/buy-now-cart'
import { useAuth } from '@/lib/auth-context'
import { useAuthBackup } from '@/lib/auth-context-backup'

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  // PROPOSAL (2026-05-17): track the new /checkout cart independently so the
  // existing Quote badge keeps reflecting the quote flow only.
  const [buyNowCount, setBuyNowCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  // Backup-project auth — used for the proposal-branch "Sign in / My orders"
  // links. Falls through to anonymous when the backup session isn't set.
  const backupAuth = useAuthBackup();

  // Cart count listener
  useEffect(() => {
    const updateCount = () => setCartCount(getItemCount());
    updateCount();
    window.addEventListener('quote-cart-updated', updateCount);
    return () => window.removeEventListener('quote-cart-updated', updateCount);
  }, []);

  // Buy-now cart listener — same-tab CustomEvent + cross-tab "storage" event
  useEffect(() => {
    const updateBuyNow = () => setBuyNowCount(buyNowCartCount());
    updateBuyNow();
    window.addEventListener(BUY_NOW_CART_EVENT, updateBuyNow);
    window.addEventListener('storage', updateBuyNow);
    return () => {
      window.removeEventListener(BUY_NOW_CART_EVENT, updateBuyNow);
      window.removeEventListener('storage', updateBuyNow);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await signOut();
    router.push('/');
    router.refresh();
  };

  // Avatar: first letter of business name or email
  const avatarLetter = profile?.business_name
    ? profile.business_name.charAt(0).toUpperCase()
    : user?.email
      ? user.email.charAt(0).toUpperCase()
      : '?';

  // Auth widget — desktop
  const AuthWidget = () => {
    if (loading) {
      // Tiny placeholder so layout doesn't shift
      return <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />;
    }

    if (!user) {
      return (
        <Link
          href="https://eshops.kometsales.com/762172"
          className="flex items-center gap-1.5 text-slate-500 hover:text-emerald-600 transition-colors text-xs font-medium whitespace-nowrap"
        >
          <User className="w-3.5 h-3.5" />
          Sign In
        </Link>
      );
    }

    // Signed in — show avatar + dropdown
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 group"
          aria-label="Account menu"
        >
          <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-700 transition-colors">
            {avatarLetter}
          </div>
          <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-emerald-600 transition-colors" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-10 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
            {profile?.business_name && (
              <div className="px-4 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-semibold text-slate-900 truncate">{profile.business_name}</p>
                {profile.status === 'pending' && (
                  <p className="text-[10px] text-amber-600 mt-0.5">Approval pending</p>
                )}
              </div>
            )}
            <Link
              href="/account"
              onClick={() => setDropdownOpen(false)}
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-colors"
            >
              My Account
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-red-600 transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  };

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
            <Link href="/shop" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              Shop
            </Link>
            <Link href="/how-it-works" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              How It Works
            </Link>
            <Link href="/about" className="text-slate-700 hover:text-emerald-600 transition-colors font-medium">
              About
            </Link>
            {/* EXP-129: MDY seasonal nav link — visible to every visitor before May 4 */}
            {new Date() < new Date("2026-05-04T23:59:59-04:00") && (
              <Link href="/mothers-day-2026" className="text-rose-600 hover:text-rose-700 transition-colors font-semibold whitespace-nowrap">
                💝 Mother&apos;s Day
              </Link>
            )}
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
            {/* PROPOSAL (2026-05-17): direct checkout cart — separate from /quote */}
            <Link href="/checkout" className="relative flex items-center gap-1 text-slate-700 hover:text-emerald-600 transition-colors p-2" aria-label="Checkout cart">
              <ShoppingCart className="h-5 w-5" />
              <span className="text-sm font-medium hidden sm:inline">Cart</span>
              {buyNowCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {buyNowCount}
                </span>
              )}
            </Link>
            <Link href="/sample-box" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg whitespace-nowrap text-sm">
              Free Sample Box
            </Link>
            {/* Backup-project auth: dropdown when signed in (My orders + Admin + Sign out) */}
            {!backupAuth.loading && (
              backupAuth.user ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-1.5 text-slate-700 hover:text-emerald-600 transition-colors text-xs font-medium whitespace-nowrap"
                    aria-label="Account menu"
                  >
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {backupAuth.user.email?.[0]?.toUpperCase() ?? "U"}
                    </div>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute right-0 top-10 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                      <div className="px-3 py-2 border-b border-slate-100 text-[11px] text-slate-500 truncate">{backupAuth.user.email}</div>
                      <Link href="/account/orders" onClick={() => setDropdownOpen(false)} className="block px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">My orders</Link>
                      <Link href="/admin/catalog" onClick={() => setDropdownOpen(false)} className="block px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">Admin catalog</Link>
                      <Link href="/admin/refunds" onClick={() => setDropdownOpen(false)} className="block px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">Admin refunds</Link>
                      <button
                        type="button"
                        onClick={async () => {
                          setDropdownOpen(false);
                          await backupAuth.signOut();
                          window.location.assign('/');
                        }}
                        className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t border-slate-100"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/auth/login"
                  className="flex items-center gap-1.5 text-slate-700 hover:text-emerald-600 transition-colors text-xs font-medium whitespace-nowrap"
                >
                  <User className="w-3.5 h-3.5" />
                  Sign in
                </Link>
              )
            )}
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
            {/* PROPOSAL (2026-05-17): mobile checkout cart icon */}
            <Link href="/checkout" className="relative flex items-center text-slate-700 hover:text-emerald-600 transition-colors p-2.5" aria-label="Checkout cart">
              <ShoppingCart className="h-5 w-5" />
              {buyNowCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-emerald-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {buyNowCount}
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
            {/* EXP-045: Shop first — consistent with hero CTA hierarchy */}
            <Link
              href="/shop"
              className="block mx-4 px-4 py-3 text-center bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              See Flowers &amp; Prices
            </Link>
            <Link
              href="/sample-box"
              className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Free Sample Box
            </Link>
            {/* EXP-129: MDY seasonal mobile nav link */}
            {new Date() < new Date("2026-05-04T23:59:59-04:00") && (
              <Link
                href="/mothers-day-2026"
                className="block px-4 py-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors rounded-lg font-semibold"
                onClick={() => setMobileMenuOpen(false)}
              >
                💝 Mother&apos;s Day — Order by May 4
              </Link>
            )}
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
            {/* PROPOSAL (2026-05-17): mobile backup-auth surface */}
            {!backupAuth.loading && (
              backupAuth.user ? (
                <Link
                  href="/account/orders"
                  className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  My orders →
                </Link>
              ) : (
                <Link
                  href="/auth/login"
                  className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign in →
                </Link>
              )
            )}
            {/* Legacy mobile auth removed 2026-05-17 — backup-auth widget above handles Sign in + My orders */}
          </div>
        )}
      </div>
    </nav>
    </>
  )
}
