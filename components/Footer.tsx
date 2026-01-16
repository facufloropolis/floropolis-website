import Link from "next/link";

export default function Footer() {
  return (
    <footer className="py-16 px-4 bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <p className="text-slate-400 leading-relaxed mb-4">Premium wholesale flowers direct from Ecuador & Colombia farms. 15-40% cheaper, 5-7 days fresher.</p>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Company</h4>
            <ul className="space-y-3 text-slate-400">
              <li><Link href="/about" className="hover:text-emerald-400 transition-colors duration-200">About</Link></li>
              <li><Link href="/how-it-works" className="hover:text-emerald-400 transition-colors duration-200">How It Works</Link></li>
              <li><Link href="/contact" className="hover:text-emerald-400 transition-colors duration-200">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Shop</h4>
            <ul className="space-y-3 text-slate-400">
              <li><Link href="/valentines" className="hover:text-emerald-400 transition-colors duration-200">Valentine's Day</Link></li>
              <li><Link href="/sample-box" className="hover:text-emerald-400 transition-colors duration-200">Free Sample Box</Link></li>
              <li><a href="https://shop.floropolis.com/762172" className="hover:text-emerald-400 transition-colors duration-200">Shop Now</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Contact</h4>
            <ul className="space-y-3 text-slate-400">
              <li className="text-emerald-400">orders@floropolis.com</li>
              <li>
                <a href="https://wa.me/17869308463" className="hover:text-emerald-400 transition-colors duration-200 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-5 h-5 fill-current">
                    <path d="M19.11 17.26c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.35-1.47-.87-.78-1.46-1.74-1.64-2.04-.17-.3-.02-.47.13-.62.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.57-.48-.5-.67-.5-.17 0-.37-.02-.57-.02s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.06 2.89 1.21 3.09.15.2 2.08 3.18 5.04 4.46.7.3 1.25.48 1.68.62.7.22 1.33.19 1.83.12.56-.08 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/>
                  </svg>
                  WhatsApp
                </a>
              </li>
              <li>
                <a href="https://www.instagram.com/floropolisdirect" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors duration-200">
                  @floropolisdirect
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800 pt-8 text-center text-slate-400">
          <p>&copy; 2026 Floropolis. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
