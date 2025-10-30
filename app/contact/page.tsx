'use client';

import { useState } from 'react';
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { CheckCircle, Mail, Phone, Clock, ArrowRight } from "lucide-react";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send message');
      }

      setShowSuccess(true);
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (error) {
      console.error('Contact error:', error);
      alert('Failed to send message. Please try again or call us at +1 786-930-8463');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        
        <section className="py-24 md:py-32 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white p-12 rounded-2xl shadow-lg border-2 border-emerald-600 text-center">
              <CheckCircle className="w-20 h-20 text-emerald-600 mx-auto mb-6" />
              <h1 className="text-3xl font-bold text-slate-900 mb-6">Thank You!</h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                We'll respond within 1 business day.
              </p>
              <button
                onClick={() => setShowSuccess(false)}
                className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all"
              >
                Send Another Message
              </button>
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
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">Get In Touch</h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            Questions about wholesale accounts, ordering, or shipping? We're here to help.
          </p>
        </div>
      </section>
      
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">

          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN - Contact Form */}
            <div className="lg:col-span-2">
              <div className="bg-white p-10 rounded-2xl shadow-lg border border-gray-200">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                      placeholder="Your name"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                        placeholder="you@email.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Phone
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                        placeholder="+1 786-930-8463"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="subject"
                      required
                      value={formData.subject}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                    >
                      <option value="">Select a subject</option>
                      <option value="General Inquiry">General Inquiry</option>
                      <option value="Registration Question">Registration Question</option>
                      <option value="Order Support">Order Support</option>
                      <option value="Partnership Opportunity">Partnership Opportunity</option>
                      <option value="Technical Issue">Technical Issue</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="message"
                      required
                      rows={5}
                      value={formData.message}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent resize-none"
                      placeholder="How can we help you?"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full py-4 rounded-lg text-lg font-bold transition-all duration-300 shadow-lg ${
                      isSubmitting 
                        ? 'bg-emerald-400 text-white cursor-not-allowed' 
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-xl'
                    }`}
                  >
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>

            {/* RIGHT COLUMN - Contact Info Cards */}
            <div className="lg:col-span-1 space-y-6">
              {/* Card 1: Reach Us Directly */}
              <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
                <h3 className="text-2xl font-bold text-slate-900 mb-6">Reach Us Directly</h3>
                <div className="space-y-4 text-slate-600">
                  <div className="flex items-center space-x-3">
                    <Mail className="w-5 h-5 text-emerald-600" />
                    <a href="mailto:hello@floropolis.com" className="text-emerald-600 hover:underline font-semibold">hello@floropolis.com</a>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Phone className="w-5 h-5 text-emerald-600" />
                    <a href="tel:+17869308463" className="text-slate-900 font-semibold">+1 786-930-8463</a>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Phone className="w-5 h-5 text-emerald-600" />
                    <a href="https://wa.me/17869308463" className="text-emerald-600 hover:underline font-semibold">WhatsApp: +1 786-930-8463</a>
                  </div>
                  
                </div>
              </div>

              

              {/* Card 3: Common Questions */}
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-8 rounded-2xl shadow-lg border-2 border-emerald-200">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Common Questions</h3>
                <ul className="space-y-3">
                  <li>
                    <a href="/pricing" className="text-slate-700 hover:text-emerald-600 hover:underline flex items-center group">
                      <ArrowRight className="w-4 h-4 mr-2 group-hover:translate-x-1 transition-transform" />
                      How does pricing work?
                    </a>
                  </li>
                  <li>
                    <a href="/how-it-works" className="text-slate-700 hover:text-emerald-600 hover:underline flex items-center group">
                      <ArrowRight className="w-4 h-4 mr-2 group-hover:translate-x-1 transition-transform" />
                      What are your payment terms?
                    </a>
                  </li>
                  <li>
                    <a href="/register" className="text-slate-700 hover:text-emerald-600 hover:underline flex items-center group">
                      <ArrowRight className="w-4 h-4 mr-2 group-hover:translate-x-1 transition-transform" />
                      How do I register?
                    </a>
                  </li>
                  <li>
                    <a href="/how-it-works" className="text-slate-700 hover:text-emerald-600 hover:underline flex items-center group">
                      <ArrowRight className="w-4 h-4 mr-2 group-hover:translate-x-1 transition-transform" />
                      What's your guarantee?
                    </a>
                  </li>
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

