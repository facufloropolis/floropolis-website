import Link from "next/link";
import Logo from "./Logo";

export default function Navigation() {
  return (
    <nav className="border-b border-gray-200 bg-white sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex-shrink-0">
            <Logo />
          </div>
          <div className="hidden md:flex space-x-10 items-center">
            <Link href="/about" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">About</Link>
            <Link href="/how-it-works" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">How It Works</Link>
            <Link href="/pricing" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">Pricing</Link>
            <Link href="/shop" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">Shop</Link>
            <Link href="/contact" className="text-slate-700 hover:text-emerald-600 transition-colors duration-200 font-medium hover:underline">Contact</Link>
            <Link href="/login" className="bg-white border border-slate-300 text-slate-700 px-6 py-3 rounded-lg hover:bg-slate-50 transition-all duration-300 font-semibold">
              Log In
            </Link>
            <Link href="/register" className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 font-semibold">
              Register
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

