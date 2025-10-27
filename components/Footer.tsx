import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="py-16 px-4 bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <div className="mb-4">
              <Logo variant="dark" />
            </div>
            <p className="text-slate-400 leading-relaxed">Farm-direct wholesale flowers for professional florists. Fresher, faster, better priced.</p>
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
            <h4 className="font-bold mb-4 text-lg">Contact</h4>
            <ul className="space-y-3 text-slate-400">
              <li><a href="#" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">Support</a></li>
              <li><a href="#" className="hover:text-emerald-400 transition-colors duration-200 hover:underline">Sales</a></li>
              <li className="text-emerald-400 hover:text-emerald-300 transition-colors duration-200">sales@floropolis.com</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800 pt-8 text-center text-slate-400">
          <p>&copy; 2024 Floropolis. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

