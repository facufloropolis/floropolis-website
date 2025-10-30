import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wholesale Flower Catalog | Floropolis',
  description: 'Browse our farm-direct wholesale flower catalog featuring premium roses, summer flowers, and gypsophila from Ecuador and Colombia.',
};

export default function Shop() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">Shop Our Products</h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Farm-direct wholesale flowers for professional florists
          </p>
        </div>
      </section>

      {/* Product Catalog */}
      <section className="py-12 md:py-20 px-4">
        <div className="max-w-7xl mx-auto">
          
          {/* Roses Section */}
          <div className="mb-20">
            <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">Roses</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80&fit=crop"
                    alt="Premium Roses"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Premium Roses</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$0.75 - $2.50/stem</p>
                  <p className="text-slate-600 mb-4">Red, pink, white, yellow, orange varieties</p>
                  <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80&fit=crop"
                    alt="Garden Roses"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Garden Roses</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$1.50 - $3.00/stem</p>
                  <p className="text-slate-600 mb-4">Heirloom varieties with exceptional fragrance</p>
                  <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80&fit=crop"
                    alt="Spray Roses"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Spray Roses</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$1.00 - $2.00/stem</p>
                  <p className="text-slate-600 mb-4">Multiple blooms per stem</p>
                  <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Calypso Section */}
          <div className="mb-20">
            <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">Calypso</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1463320726281-696a485928c7?w=800&q=80&fit=crop"
                    alt="Calypso"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Calypso Blooms</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$0.50 - $1.50/stem</p>
                  <p className="text-slate-600 mb-4">Fresh calypso flowers</p>
                  <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1463320726281-696a485928c7?w=800&q=80&fit=crop"
                    alt="Calypso Mix"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Calypso Mix</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$0.50 - $1.50/stem</p>
                  <p className="text-slate-600 mb-4">Mixed calypso arrangements</p>
                  <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1463320726281-696a485928c7?w=800&q=80&fit=crop"
                    alt="Premium Calypso"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Premium Calypso</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$0.75 - $2.00/stem</p>
                  <p className="text-slate-600 mb-4">Premium calypso varieties</p>
                  <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Summer Flowers Section */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">Summer Flowers</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1463320726281-696a485928c7?w=800&q=80&fit=crop"
                    alt="Summer Mix"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Summer Mix</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$0.50 - $1.50/stem</p>
                  <p className="text-slate-600 mb-4">Gerbera, sunflowers, lisianthus</p>
                  <a href="/register" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1463320726281-696a485928c7?w=800&q=80&fit=crop"
                    alt="Summer Blooms"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Summer Blooms</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$0.50 - $1.50/stem</p>
                  <p className="text-slate-600 mb-4">Fresh seasonal arrangements</p>
                  <a href="/register" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all group">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4">
                  <Image
                    src="https://images.unsplash.com/photo-1463320726281-696a485928c7?w=800&q=80&fit=crop"
                    alt="Summer Collection"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Summer Collection</h3>
                  <p className="text-emerald-600 text-xl font-bold mb-2">$0.50 - $1.50/stem</p>
                  <p className="text-slate-600 mb-4">Premium summer varieties</p>
                  <a href="/register" className="block w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center">
                    Register for Access
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-3xl p-12 text-center text-white shadow-2xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Order?</h2>
            <p className="text-xl mb-8 text-emerald-100">Request a wholesale quote or register for access</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register" className="bg-white text-emerald-600 px-8 py-4 rounded-lg text-lg font-bold hover:bg-emerald-50 transition-all shadow-lg">
                Register for Access
              </Link>
              <Link href="/contact" className="border-2 border-white text-white px-8 py-4 rounded-lg text-lg font-bold hover:bg-white/10 transition-all">
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

