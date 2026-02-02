"use client";

import Link from "next/link";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";

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
              <li><Link href="/contact" className="hover:text-emerald-400 transition-colors duration-200" onClick={() => pushEvent(CTA_EVENTS.contact_click, { cta_location: "footer" })}>Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Shop</h4>
            <ul className="space-y-3 text-slate-400">
              <li><Link href="/valentines" className="hover:text-emerald-400 transition-colors duration-200" onClick={() => pushEvent(CTA_EVENTS.valentine_shop_click, { cta_location: "footer" })}>Valentine's Day</Link></li>
              <li><Link href="/sample-box" className="hover:text-emerald-400 transition-colors duration-200" onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "footer" })}>Free Sample Box</Link></li>
              <li><a href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website" className="hover:text-emerald-400 transition-colors duration-200" onClick={() => pushEvent(CTA_EVENTS.shop_now_click, { cta_location: "footer" })}>Shop Now</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-lg">Contact</h4>
            <ul className="space-y-3 text-slate-400">
              <li>
                <a href="mailto:orders@floropolis.com" className="text-emerald-400 hover:text-emerald-300 transition-colors" onClick={() => pushEvent(CTA_EVENTS.footer_email_click)}>orders@floropolis.com</a>
              </li>
              <li>
                <a href="https://wa.me/17869308463" className="hover:text-emerald-400 transition-colors duration-200 flex items-center gap-2" onClick={() => pushEvent(CTA_EVENTS.footer_whatsapp_click)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-5 h-5 fill-current">
                    <path d="M19.11 17.26c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.35-1.47-.87-.78-1.46-1.74-1.64-2.04-.17-.3-.02-.47.13-.62.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.57-.48-.5-.67-.5-.17 0-.37-.02-.57-.02s-.52.07-.79.37c-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.06 2.89 1.21 3.09.15.2 2.08 3.18 5.04 4.46.7.3 1.25.48 1.68.62.7.22 1.33.19 1.83.12.56-.08 1.77-.72 2.02-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/>
                  </svg>
                  WhatsApp
                </a>
              </li>
              <li>
                <a href="https://www.instagram.com/floropolisdirect" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors duration-200 flex items-center gap-2" onClick={() => pushEvent(CTA_EVENTS.footer_instagram_click)}>
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  Instagram
                </a>
              </li>
              <li>
                <a href="https://www.tiktok.com/@floropolisdirect" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors duration-200 flex items-center gap-2" onClick={() => pushEvent(CTA_EVENTS.footer_tiktok_click)}>
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                  TikTok
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
