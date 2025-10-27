'use client';

import { useState } from 'react';
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email and password
    if (!email || !password) {
      return;
    }

    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setShowMessage(true);
    setIsSubmitting(false);
  };

  if (showMessage) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        
        <section className="py-24 md:py-32 px-4">
          <div className="max-w-md mx-auto">
            <div className="bg-white p-12 rounded-2xl shadow-lg border-2 border-emerald-600 text-center">
              <h1 className="text-3xl font-bold text-slate-900 mb-6">Coming Soon</h1>
              <p className="text-lg text-slate-600 leading-relaxed">
                Login functionality is being set up. We'll email you at{' '}
                <span className="text-emerald-600 font-semibold">{email}</span> when your account is ready.
              </p>
              <Link href="/" className="inline-block mt-8 bg-emerald-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all">
                Back to Home
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-20 md:py-28 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">Welcome Back</h1>
          <p className="text-xl text-slate-600">
            Log in to access wholesale pricing and place orders
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8">
            
            {/* LEFT COLUMN - Login Form */}
            <div>
              <div className="bg-white p-8 rounded-xl shadow-lg max-w-md mx-auto lg:mx-0">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                      placeholder="your@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors pr-12"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="mr-2 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-sm text-slate-700">Remember me</span>
                    </label>
                    <Link href="/contact" className="text-sm text-emerald-600 hover:underline font-semibold">
                      Forgot password?
                    </Link>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 text-white py-4 rounded-lg text-lg font-bold hover:bg-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    {isSubmitting ? 'Logging in...' : 'Log In'}
                  </button>
                </form>

                {/* Divider */}
                <div className="my-8 flex items-center">
                  <div className="flex-1 border-t border-gray-300"></div>
                  <span className="px-4 text-sm text-slate-500">or</span>
                  <div className="flex-1 border-t border-gray-300"></div>
                </div>

                <p className="text-sm text-slate-600 text-center">
                  Don't have an account yet?{' '}
                  <Link href="/register" className="text-emerald-600 hover:underline font-semibold">
                    Register for wholesale access
                  </Link>
                </p>
              </div>
            </div>

            {/* RIGHT COLUMN - Benefits Card */}
            <div>
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-8 rounded-xl shadow-lg border-2 border-emerald-200 max-w-md mx-auto lg:mx-0">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Trade Account Benefits</h2>
                <ul className="space-y-3">
                  {[
                    'Access to live wholesale pricing',
                    'Net-30 payment terms (after first order)',
                    'Standing order templates',
                    'Order history and tracking',
                    'Dedicated account support',
                    'API integration available'
                  ].map((benefit) => (
                    <li key={benefit} className="flex items-start text-slate-700">
                      <span className="text-emerald-600 mr-2 mt-0.5 flex-shrink-0">✓</span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

