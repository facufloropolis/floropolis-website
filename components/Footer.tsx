import Link from "next/link";

export default function Footer() {
  return (
    <footer className="py-16 px-4 bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <p className="text-slate-400 leading-relaxed mb-4">Flowers so fresh you can smell them, at the best prices</p>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Company</h4>
            <ul className="space-y-3 text-slate-400">
              <li><Link href="/about" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">About</Link></li>
              <li><Link href="/how-it-works" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">How It Works</Link></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">Careers</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Resources</h4>
            <ul className="space-y-3 text-slate-400">
              <li><Link href="/pricing" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">Pricing</Link></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">FAQs</a></li>
              <li><Link href="/contact" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Shop</h4>
            <ul className="space-y-3 text-slate-400">
              <li><a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">Register</a></li>
              <li><a href="https://shop.floropolis.com/762172" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">Shop Now</a></li>
              <li className="text-emerald-400 hover:text-emerald-300 transition-colors duration-200">hello@floropolis.com</li>
            </ul>
            <div className="mt-4">
              <a href="https://wa.me/17869308463" aria-label="WhatsApp" className="inline-block">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-10 h-10 fill-[#25D366] hover:opacity-90 transition-opacity">
                  <path d="M19.11 17.26c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.35-1.47-.87-.78-1.46-1.74-1.64-2.04-.17-.3-.02-.47.13-.62.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.57-.48-.5-.67-.5-.17 0-.37-.02-.57-.02s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.06 2.89 1.21 3.09.15.2 2.08 3.18 5.04 4.46.7.3 1.25.48 1.68.62.7.22 1.33.19 1.83.12.56-.08 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/>
                  <path d="M26.88 5.13A14.86 14.86 0 0 0 16.02.5C7.5.5.55 7.46.55 16c0 2.72.72 5.27 2.08 7.55L.5 31.5l8.17-2.08A15.34 15.34 0 0 0 16 31.5C24.54 31.5 31.5 24.54 31.5 16S24.54.5 16 .5h.02zm0 24.02A12.88 12.88 0 0 1 16 28.88c-2.22 0-4.36-.57-6.25-1.65l-.45-.26-4.85 1.23 1.29-4.72-.3-.48A12.9 12.9 0 1 1 28.88 16c0 3.45-1.35 6.7-3.77 9.15z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 pt-8 text-center text-slate-400">
          <p>&copy; 2024 Floropolis. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

