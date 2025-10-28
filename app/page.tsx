"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Logo from "@/components/Logo";
import { Menu, X, DollarSign, Zap, Plug, ChevronDown, ArrowRight, ShoppingCart, CheckCircle2, Search, Plane, Truck, Package } from "lucide-react";

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white">
      {/* Free Shipping Banner */}
      <div className="bg-emerald-600 text-white py-3 text-center text-sm font-semibold tracking-wide">
        ✨ FREE SHIPPING on orders over $150 | Farm-Direct Freshness Guaranteed
      </div>

      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex-shrink-0">
              <Logo />
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex space-x-10 items-center">
              <Link href="/about" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">
                About
              </Link>
              <Link href="/how-it-works" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">
                How It Works
              </Link>
              <Link href="/pricing" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">
                Pricing
              </Link>
              <Link href="/shop" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">
                Shop
              </Link>
              <Link href="/contact" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">
                Contact
              </Link>
              <Link 
                href="/login" 
                className="bg-white border border-slate-300 text-slate-700 px-6 py-3 rounded-lg hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all duration-300 font-semibold"
              >
                Log In
              </Link>
              <Link 
                href="/register" 
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg hover:shadow-xl font-semibold"
              >
                Register
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-slate-700 hover:text-emerald-600 transition-colors p-2"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 space-y-3 border-t border-slate-200">
              <Link 
                href="/about" 
                className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                About
              </Link>
              <Link 
                href="/how-it-works" 
                className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                How It Works
              </Link>
              <Link 
                href="/pricing" 
                className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </Link>
              <Link 
                href="/shop" 
                className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Shop
              </Link>
              <Link 
                href="/contact" 
                className="block px-4 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors rounded-lg font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Contact
              </Link>
              <Link 
                href="/login" 
                className="block mx-4 px-4 py-3 text-center border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-semibold"
                onClick={() => setMobileMenuOpen(false)}
              >
                Log In
              </Link>
              <Link 
                href="/register" 
                className="block mx-4 px-4 py-3 text-center bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold"
                onClick={() => setMobileMenuOpen(false)}
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=2000"
            alt="Professional florist arranging fresh flowers in a bright studio"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"></div>
        </div>
        <div className="relative z-10 max-w-4xl text-center px-6">
          <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6 tracking-tight drop-shadow-lg">
            Farm-Direct Wholesale Flowers That Actually Arrive Fresh
          </h1>
          <p className="text-xl md:text-2xl text-white/90 font-light mb-8 max-w-2xl mx-auto">
            Premium seasonal summer flowers, delphinium, and gypsophila shipped direct from Ecuador in 48-72 hours. No middlemen. No disappointments.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/register" className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 text-lg font-semibold rounded-full shadow-2xl hover:shadow-emerald-500/50 hover:scale-105 transition-all inline-block">
              Get Your Sample Box
            </Link>
            <Link href="/how-it-works" className="border-2 border-white text-white px-10 py-5 text-lg font-semibold rounded-full hover:bg-white/10 backdrop-blur hover:scale-105 transition-all inline-block">
              See How It Works
            </Link>
          </div>
        </div>
        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
          <ChevronDown className="w-8 h-8 text-white/80" />
        </div>
      </section>

      {/* Trust Bar */}
      <section className="bg-white border-y border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-emerald-600 mb-2">5-7 Days Fresher</div>
              <div className="text-sm md:text-base text-slate-600 tracking-wide font-semibold">vs. traditional wholesale</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-emerald-600 mb-2">15-25% Lower Cost</div>
              <div className="text-sm md:text-base text-slate-600 tracking-wide font-semibold">by eliminating middlemen</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-emerald-600 mb-2">95% On-Time Delivery</div>
              <div className="text-sm md:text-base text-slate-600 tracking-wide font-semibold">farm-to-door delivery</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-emerald-600 mb-2">FREE Shipping</div>
              <div className="text-sm md:text-base text-slate-600 tracking-wide font-semibold">on orders over $150</div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Categories */}
      <section className="py-24 px-6 md:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">WHAT WE OFFER</div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">Three Core Collections from Our Partner Farms</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              We work exclusively with Megaflor (Ecuador) and Flodecol (Ecuador) to bring you seasonal summer flowers, delphinium, and gypsophila.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
            {/* Roses */}
            <Link href="/shop/roses" className="group cursor-pointer">
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all group-hover:-translate-y-[4px] duration-300 border border-slate-200/20">
                <Image
                  src="https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80&fit=crop"
                  alt="Premium roses collection"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <h3 className="text-3xl md:text-4xl font-bold text-white mb-2">Roses</h3>
                  <p className="text-lg text-white/80 mb-4">From Megaflor, Ecuador - Seasonal varieties</p>
                  <div className="flex items-center gap-2 text-white/90 group-hover:text-white transition-all">
                    <span className="font-semibold">Shop Now</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>

            {/* Summer Flowers */}
            <Link href="/shop/summer-flowers" className="group cursor-pointer">
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all group-hover:-translate-y-[4px] duration-300 border border-slate-200/20">
                <Image
                  src="https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80&fit=crop"
                  alt="Summer flowers collection"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <h3 className="text-3xl md:text-4xl font-bold text-white mb-2">Summer Flowers</h3>
                  <p className="text-lg text-white/80 mb-4">From Megaflor, Ecuador - Seasonal varieties</p>
                  <div className="flex items-center gap-2 text-white/90 group-hover:text-white transition-all">
                    <span className="font-semibold">Shop Now</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>

            {/* Gypsophila */}
            <Link href="/shop/gypsophila" className="group cursor-pointer">
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all group-hover:-translate-y-[4px] duration-300 border border-slate-200/20">
                <Image
                  src="https://images.unsplash.com/photo-1591886960571-74d43a9d4166?w=800&q=80&fit=crop"
                  alt="Baby's Breath and fillers collection"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <h3 className="text-3xl md:text-4xl font-bold text-white mb-2">Delphinium & Gypsophila</h3>
                  <p className="text-lg text-white/80 mb-4">From Flodecol, Ecuador</p>
                  <div className="flex items-center gap-2 text-white/90 group-hover:text-white transition-all">
                    <span className="font-semibold">Shop Now</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Order Online Section */}
      <section className="py-24 px-6 md:px-8 bg-gradient-to-br from-slate-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">COMING SOON</div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Order Directly Online</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              We're building a seamless ordering experience powered by Komet Sales
            </p>
          </div>
          
          <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-emerald-600">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 to-transparent z-10"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-white/95 backdrop-blur px-12 py-8 rounded-2xl shadow-2xl text-center">
              <div className="text-6xl mb-4">🚧</div>
              <h3 className="text-3xl font-bold text-slate-900 mb-2">Work In Progress</h3>
              <p className="text-lg text-slate-600 mb-4">Connecting to Komet Sales Platform</p>
              <div className="flex items-center justify-center gap-2 text-emerald-600 font-semibold">
                <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></div>
                <span>Coming Soon</span>
              </div>
            </div>
            <Image
              src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80"
              alt="Modern e-commerce platform preview"
              width={1200}
              height={600}
              className="w-full opacity-40"
            />
          </div>

          <div className="mt-12 text-center">
            <p className="text-slate-600 mb-6">In the meantime, place orders by phone or email</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="tel:5551234567" className="bg-emerald-600 text-white px-8 py-4 rounded-full font-semibold hover:bg-emerald-700 transition-all inline-block">
                📞 Call to Order: (555) 123-4567
              </a>
              <a href="mailto:orders@floropolis.com" className="border-2 border-emerald-600 text-emerald-600 px-8 py-4 rounded-full font-semibold hover:bg-emerald-50 transition-all inline-block">
                ✉️ Email: orders@floropolis.com
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Value Propositions */}
      <section className="py-24 px-6 md:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">BUILT FOR PROFESSIONAL FLORISTS</div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">Stop Wasting Time and Money on the Traditional Supply Chain</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 md:gap-12">
            {/* Farm-Direct Savings */}
            <div className="bg-white p-8 md:p-10 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group cursor-pointer">
              <div className="relative aspect-[4/3] mb-6 rounded-xl overflow-hidden shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80&fit=crop"
                  alt="Farm direct flowers from Ecuador"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <DollarSign className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Farm-Direct Savings</h3>
              <p className="text-lg text-slate-600 leading-relaxed">
                Eliminate 2-3 middlemen and save 15-25% on your flower costs.
              </p>
            </div>

            {/* Maximum Freshness */}
            <div className="bg-white p-8 md:p-10 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group cursor-pointer">
              <div className="relative aspect-[4/3] mb-6 rounded-xl overflow-hidden shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1464938050520-ef2270bb8ce8?w=800&q=80&fit=crop"
                  alt="Fresh flowers with extended vase life"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Zap className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Maximum Freshness</h3>
              <p className="text-lg text-slate-600 leading-relaxed">
                5-7 days longer vase life means less waste and happier customers.
              </p>
            </div>

            {/* Reliable Delivery */}
            <div className="bg-white p-8 md:p-10 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group cursor-pointer">
              <div className="relative aspect-[4/3] mb-6 rounded-xl overflow-hidden shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80&fit=crop"
                  alt="Reliable delivery and tracking"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Reliable Delivery</h3>
              <p className="text-lg text-slate-600 leading-relaxed">
                95% on-time SLA with FedEx Priority and real-time tracking.
              </p>
            </div>

            {/* Built for Your Business */}
            <div className="bg-white p-8 md:p-10 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group cursor-pointer">
              <div className="relative aspect-[4/3] mb-6 rounded-xl overflow-hidden shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80&fit=crop"
                  alt="B2B wholesale flower service"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Plug className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Built for Your Business</h3>
              <p className="text-lg text-slate-600 leading-relaxed">
                Net-30 terms, standing orders, and dedicated support for B2B buyers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Visual Process */}
      <section className="py-24 px-6 md:px-8 bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">THE FLOROPOLIS DIFFERENCE</div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">Why Professional Florists Are Switching</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">We eliminate 2-3 middlemen between the farm and your shop. That means fresher flowers, better margins, and zero morning market runs.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            {/* Step 1: Browse Live Inventory */}
            <div className="bg-white p-8 md:p-10 rounded-2xl shadow-md hover:shadow-xl transition-all relative group">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <Search className="w-10 h-10 text-emerald-600" />
                </div>
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">1</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Browse Live Inventory</h3>
              <p className="text-slate-600 leading-relaxed text-center">Access real-time pricing and availability on 300+ SKUs</p>
            </div>

            {/* Step 2: Order Online or by Phone */}
            <div className="bg-white p-8 md:p-10 rounded-2xl shadow-md hover:shadow-xl transition-all relative group">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <ShoppingCart className="w-10 h-10 text-emerald-600" />
                </div>
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">2</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Order Online or by Phone</h3>
              <p className="text-slate-600 leading-relaxed text-center">Secure checkout with Net-30 terms for qualified businesses</p>
            </div>

            {/* Step 3: Farm-Direct Shipping */}
            <div className="bg-white p-8 md:p-10 rounded-2xl shadow-md hover:shadow-xl transition-all relative group">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <Plane className="w-10 h-10 text-emerald-600" />
                </div>
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">3</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Farm-Direct Shipping</h3>
              <p className="text-slate-600 leading-relaxed text-center">Flowers are cut, quality-checked, and packed within 24 hours</p>
            </div>

            {/* Step 4: Arrives in 48-72 Hours */}
            <div className="bg-white p-8 md:p-10 rounded-2xl shadow-md hover:shadow-xl transition-all relative group">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <Package className="w-10 h-10 text-emerald-600" />
                </div>
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">4</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Arrives in 48-72 Hours</h3>
              <p className="text-slate-600 leading-relaxed text-center">Direct delivery with full tracking and freshness guarantee</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 px-6 md:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">TRUSTED BY PROFESSIONALS</div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">What Florists Are Saying</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"Switching to Floropolis cut my flower costs by 20% and the quality is noticeably better. My customers keep commenting on how long the arrangements last."</p>
              <div className="font-semibold text-slate-900">Sarah Martinez</div>
              <div className="text-sm text-slate-500">Bloom & Co., Miami</div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"No more 4 AM market runs! The flowers arrive fresher than anything I could get locally, and the tracking gives me complete peace of mind."</p>
              <div className="font-semibold text-slate-900">David Chen</div>
              <div className="text-sm text-slate-500">Petals & Events, Los Angeles</div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"The sample box sold me immediately. These roses are stunning and my profit margins have improved significantly since I started ordering from Floropolis."</p>
              <div className="font-semibold text-slate-900">Jennifer Torres</div>
              <div className="text-sm text-slate-500">Garden Gate Florist, Austin</div>
            </div>
          </div>
        </div>
      </section>

      {/* Meet the Team Section */}
      <section className="py-24 px-6 md:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">THE TEAM BEHIND FLOROPOLIS</div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 leading-tight">
              Built by People Who've Lived Your Challenges
            </h2>
            <p className="text-xl text-slate-600 max-w-4xl mx-auto leading-relaxed">
              We're not just another tech platform—we're flower industry veterans and technology experts who've experienced firsthand the frustrations of unreliable suppliers, inconsistent quality, and the 4 AM market runs that eat into your profits and your life.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 mb-16">
            {/* Facundo */}
            <div className="bg-slate-50 rounded-2xl p-8 hover:shadow-xl transition-all">
              <div className="flex items-start gap-6 mb-6">
                <div className="w-24 h-24 rounded-full bg-emerald-600 flex items-center justify-center text-white text-3xl font-bold flex-shrink-0">
                  FL
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-1">Facundo Lavino</h3>
                  <a href="https://www.linkedin.com/in/faculavino" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-emerald-600 text-sm transition-colors">
                    View LinkedIn →
                  </a>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                With 25+ years scaling high-growth companies at Twitter, Google, and venture-backed startups, Facundo brings world-class operations expertise to the flower industry. As former VP of Strategy & Operations at WM Technology, he drove $216M in revenue growth and led global business transformations.
              </p>
              <p className="text-slate-700 leading-relaxed">
                His data-driven approach and mastery of building customer-centric organizations now powers Floropolis's mission to bring transparency and efficiency to wholesale flower distribution.
              </p>
            </div>

            {/* Juan Javier */}
            <div className="bg-slate-50 rounded-2xl p-8 hover:shadow-xl transition-all">
              <div className="flex items-start gap-6 mb-6">
                <div className="w-24 h-24 rounded-full bg-emerald-600 flex items-center justify-center text-white text-3xl font-bold flex-shrink-0">
                  JP
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-1">Juan Javier Pallares</h3>
                  <a href="https://www.linkedin.com/in/juan-javier-pallares-a16b62254" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-emerald-600 text-sm transition-colors">
                    View LinkedIn →
                  </a>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                Juan Javier grew up in Ecuador's flower industry, living and breathing the challenges that florists face every day. As Project Manager at Kubical LLC, he pioneered Snaproses.com's e-commerce system, boosting sales by 25% and negotiating logistics partnerships that cut costs by 10%.
              </p>
              <p className="text-slate-700 leading-relaxed">
                His firsthand experience managing supply chains from farm to retailer, combined with his MBA from FIU and success at Koronet closing $51K+ in ARR, gives him unique insight into what florists truly need to succeed.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-2xl p-12 text-white text-center">
            <h3 className="text-3xl font-bold mb-6">Our Commitment to You</h3>
            <p className="text-xl text-emerald-50 leading-relaxed max-w-4xl mx-auto mb-8">
              We've sat across the table from frustrated florists who've been let down by suppliers one too many times. We've seen the toll that unreliable deliveries take on your business and your peace of mind. We've experienced the complexity of South American logistics and watched talented growers struggle to reach quality retailers.
            </p>
            <p className="text-xl text-emerald-50 leading-relaxed max-w-4xl mx-auto mb-8">
              That's why we built Floropolis—not as outsiders looking in, but as insiders committed to fixing what's broken. We're combining decades of tech expertise with deep flower industry knowledge to create the transparent, reliable, farm-direct platform you deserve.
            </p>
            <div className="inline-block bg-white text-emerald-600 px-8 py-4 rounded-full font-bold text-lg">
              Your success is our only metric.
            </div>
          </div>
        </div>
      </section>

      {/* Guarantee Section */}
      <section className="py-24 px-6 md:px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">ZERO RISK</div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight leading-tight">
            Try Floropolis Risk-Free
          </h2>
          <p className="text-xl text-slate-600 mb-12 leading-relaxed max-w-3xl mx-auto">
            If your first order doesn't arrive fresher than anything you've bought from your current supplier, we'll refund your money and give you a credit for your next order. We carry the risk, not you.
          </p>
          <div className="space-y-4">
            <Link href="/register" className="bg-emerald-600 text-white px-10 py-5 rounded-full text-lg font-semibold hover:bg-emerald-700 hover:scale-105 transition-all shadow-lg inline-block">
              Request Your Sample Box
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6 md:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-emerald-600 uppercase tracking-widest text-sm font-semibold mb-3">COMMON QUESTIONS</div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What's the minimum order?</h3>
              <p className="text-slate-600">Our minimum order is just $150, making it easy for small shops to access premium wholesale pricing. Most orders ship for free with direct farm-to-door delivery.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Do you offer Net-30 payment terms?</h3>
              <p className="text-slate-600">Yes! Once approved, established businesses can access Net-30 terms. New customers start with credit card or ACH payments, with terms available after 2-3 successful orders.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">How does shipping work?</h3>
              <p className="text-slate-600">We ship directly from our distribution hub within 48-72 hours of your order. You'll receive tracking info immediately, and flowers typically arrive within 2-3 business days depending on your location.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What if flowers arrive damaged?</h3>
              <p className="text-slate-600">Simply send us photos within 24 hours and we'll issue a full refund or replacement shipment immediately. We stand behind our 7-day freshness guarantee 100%.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Can I order specific rose colors?</h3>
              <p className="text-slate-600">Absolutely! We carry 25+ rose varieties in various colors. Our online catalog shows real-time availability so you can see exactly what's in stock at our farms.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 px-6 md:px-8 bg-gradient-to-br from-emerald-600 via-emerald-600 to-green-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight leading-tight">
            Ready to Stop Driving to the Market at 4 AM?
          </h2>
          <p className="text-xl text-emerald-100 mb-12 leading-relaxed max-w-2xl mx-auto">
            Join 500+ professional florists who've already switched to farm-direct sourcing.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/register" className="bg-white text-emerald-600 px-10 py-5 rounded-full text-lg font-semibold hover:bg-emerald-50 hover:scale-105 transition-all shadow-lg inline-block">
              Get Started
            </Link>
            <Link href="/contact" className="border-2 border-white text-white px-10 py-5 rounded-full text-lg font-semibold hover:bg-white/10 hover:scale-105 transition-all inline-block">
              Talk to Our Team
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="mb-4">
                <Logo variant="dark" />
              </div>
              <p className="text-slate-400 leading-relaxed">Floropolis connects professional florists, event designers, and funeral homes directly with premium flower farms in Ecuador. By eliminating traditional wholesalers, we deliver fresher flowers at better prices with reliable logistics you can count on.</p>
              <p className="text-slate-500 text-sm mt-6">&copy; 2025 Floropolis. All rights reserved.</p>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-lg">Company</h4>
              <ul className="space-y-3 text-slate-400">
                <li><Link href="/about" className="hover:text-emerald-400 transition-colors">About Us</Link></li>
                <li><Link href="/how-it-works" className="hover:text-emerald-400 transition-colors">How It Works</Link></li>
                <li><Link href="/pricing" className="hover:text-emerald-400 transition-colors">Pricing</Link></li>
                <li><Link href="/contact" className="hover:text-emerald-400 transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-lg">Support</h4>
              <ul className="space-y-3 text-slate-400">
                <li><Link href="/register" className="hover:text-emerald-400 transition-colors">Register</Link></li>
                <li><Link href="/login" className="hover:text-emerald-400 transition-colors">Login</Link></li>
                <li><Link href="/contact" className="hover:text-emerald-400 transition-colors">Help Center</Link></li>
                <li><Link href="/contact" className="hover:text-emerald-400 transition-colors">Terms of Service</Link></li>
                <li><Link href="/contact" className="hover:text-emerald-400 transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-lg">Get In Touch</h4>
              <ul className="space-y-3 text-slate-400">
                <li><a href="mailto:orders@floropolis.com" className="hover:text-emerald-400 transition-colors">orders@floropolis.com</a></li>
                <li><a href="tel:5551234567" className="hover:text-emerald-400 transition-colors">(555) 123-4567</a></li>
                <li className="text-slate-500">Mon-Fri, 8am-6pm EST</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center text-slate-400 text-sm">
            <p>&copy; 2025 Floropolis. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <Link href="/contact" className="hover:text-emerald-400 transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-emerald-400 transition-colors">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
