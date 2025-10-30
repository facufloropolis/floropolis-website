'use client';

import { useState } from 'react';
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { CheckCircle } from 'lucide-react';

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

export default function Register() {
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [formData, setFormData] = useState({
    businessName: '',
    taxId: '',
    website: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    primaryProducts: [] as string[],
    agreement: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleCheckboxChange = (product: string) => {
    setFormData(prev => ({
      ...prev,
      primaryProducts: prev.primaryProducts.includes(product)
        ? prev.primaryProducts.filter(p => p !== product)
        : [...prev.primaryProducts, product]
    }));
  };

  const handleAgreementChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, agreement: e.target.checked }));
    if (errors.agreement) {
      setErrors(prev => ({ ...prev, agreement: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Business Information
    if (!formData.businessName) newErrors.businessName = 'Required';
    if (!formData.taxId) newErrors.taxId = 'Required';

    // Contact Information
    if (!formData.firstName) newErrors.firstName = 'Required';
    if (!formData.lastName) newErrors.lastName = 'Required';
    if (!formData.email) {
      newErrors.email = 'Required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.phone) {
      newErrors.phone = 'Required';
    } else if (!/^\(?[0-9]{3}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}$/.test(formData.phone)) {
      newErrors.phone = 'Invalid phone format';
    }

    // Business Address
    if (!formData.street) newErrors.street = 'Required';
    if (!formData.city) newErrors.city = 'Required';
    if (!formData.state) newErrors.state = 'Required';
    if (!formData.zip) {
      newErrors.zip = 'Required';
    } else if (!/^\d{5}$/.test(formData.zip)) {
      newErrors.zip = 'ZIP code must be 5 digits';
    }

    // Agreement
    if (!formData.agreement) newErrors.agreement = 'Required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const subject = encodeURIComponent('Sample Box Request - Floropolis');
      const body = encodeURIComponent(`Business Name: ${formData.businessName}
Website: ${formData.website}
Tax ID: ${formData.taxId}
Contact: ${formData.firstName} ${formData.lastName}
Email: ${formData.email}
Phone: ${formData.phone}
Address: ${formData.street}, ${formData.city}, ${formData.state} ${formData.zip}
Products of Interest: ${formData.primaryProducts.join(', ')}`);
      window.location.href = `mailto:order@floropolis.com?subject=${subject}&body=${body}`;

      setSubmittedEmail(formData.email);
      setShowSuccess(true);

      setFormData({
        businessName: '',
        taxId: '',
        website: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        street: '',
        city: '',
        state: '',
        zip: '',
        primaryProducts: [],
        agreement: false
      });
    } catch (error) {
      console.error('Registration error:', error);
      alert('Failed to submit registration. Please try again or contact us at hello@floropolis.com');
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
              <h1 className="text-3xl font-bold text-slate-900 mb-6">Thank You for Registering!</h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-4">
                We'll review your application and send you login credentials within 1 business day.
              </p>
              <p className="text-lg text-slate-700 font-semibold mb-8">
                Check your email at <span className="text-emerald-600">{submittedEmail}</span> for next steps.
              </p>
              <p className="text-sm text-slate-500">
                Questions? Contact us at hello@floropolis.com
              </p>
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
      <section className="py-12 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">
            Register Your Trade Account
          </h1>
          <p className="text-xl text-slate-600">
            Get access to wholesale pricing and place your first order
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid gap-8">
            
            {/* LEFT COLUMN - Registration Form */}
            <div>
              <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200 space-y-8">
                
                {/* SECTION 1: Business Information */}
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Business Information</h2>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Business Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="businessName"
                        value={formData.businessName}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.businessName ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                        placeholder="Your Business Name"
                      />
                      {errors.businessName && <p className="text-red-500 text-sm mt-1">{errors.businessName}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Business Website (optional)
                      </label>
                      <input
                        type="url"
                        name="website"
                        value={formData.website}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                        placeholder="https://yourbusiness.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Tax ID / Resale Certificate Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="taxId"
                        value={formData.taxId}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.taxId ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                        placeholder="XX-XXXXXXX"
                      />
                      <p className="text-sm text-slate-500 mt-1">Required to verify business account</p>
                      {errors.taxId && <p className="text-red-500 text-sm mt-1">{errors.taxId}</p>}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Contact Information */}
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Contact Information</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.firstName ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                      />
                      {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.lastName ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                      />
                      {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.email ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                        placeholder="you@business.com"
                      />
                      <p className="text-sm text-slate-500 mt-1">We'll send your account credentials here</p>
                      {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.phone ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                        placeholder="+1 786-930-8463"
                      />
                      {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Business Address */}
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Business Address</h2>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Street Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="street"
                        value={formData.street}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.street ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                      />
                      {errors.street && <p className="text-red-500 text-sm mt-1">{errors.street}</p>}
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                          City <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="city"
                          value={formData.city}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                            errors.city ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                          }`}
                        />
                        {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">
                          State <span className="text-red-500">*</span>
                        </label>
                        <select
                          name="state"
                          value={formData.state}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                            errors.state ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                          }`}
                        >
                          <option value="">Select state</option>
                          {US_STATES.map(state => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                        {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
                      </div>
                    </div>

                    <div className="max-w-xs">
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        ZIP Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="zip"
                        value={formData.zip}
                        onChange={handleInputChange}
                        maxLength={5}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                          errors.zip ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 focus:ring-emerald-600'
                        }`}
                        placeholder="12345"
                      />
                      {errors.zip && <p className="text-red-500 text-sm mt-1">{errors.zip}</p>}
                    </div>
                  </div>
                </div>

                {/* SECTION 4: Products of Interest */}
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Products of Interest</h2>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-4">
                        Primary Products of Interest
                      </label>
                      <div className="space-y-3">
                        {['Premium Roses', 'Summer Flowers', 'Gypsophila (Baby\'s Breath)', 'All of the above'].map(product => (
                          <label key={product} className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.primaryProducts.includes(product)}
                              onChange={() => handleCheckboxChange(product)}
                              className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                            />
                            <span className="ml-3 text-slate-700">{product}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 5: Agreement */}
                <div>
                  <label className="flex items-start cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.agreement}
                      onChange={handleAgreementChange}
                      className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 mt-1 mr-3"
                    />
                    <span className="text-sm text-slate-700">
                      I confirm this is a legitimate wholesale business account and agree to Floropolis{' '}
                      <a href="#" className="text-emerald-600 hover:underline font-semibold">Terms of Service</a>
                      <span className="text-red-500 ml-1">*</span>
                    </span>
                  </label>
                  {errors.agreement && <p className="text-red-500 text-sm mt-2">{errors.agreement}</p>}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-4 rounded-lg text-lg font-bold transition-all duration-300 shadow-lg ${
                    isSubmitting 
                      ? 'bg-emerald-400 text-white cursor-not-allowed' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-xl'
                  }`}
                >
                  {isSubmitting ? 'Submitting...' : 'Request Sample Box'}
                </button>
              </form>
            </div>

            
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

