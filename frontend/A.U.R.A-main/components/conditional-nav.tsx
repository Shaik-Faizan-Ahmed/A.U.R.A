"use client"

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { PillBase } from "@/components/ui/3d-adaptive-navigation-bar"
import { Menu, X, ArrowUpRight } from 'lucide-react'

export default function ConditionalNav() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isHome = pathname === '/'

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Features', href: isHome ? '#features' : '/#features' },
    { label: 'Pipeline', href: isHome ? '#how-it-works' : '/#how-it-works' },
    { label: 'Student Portal', href: '/submit' },
    { label: 'Instructor', href: '/dashboard' },
    { label: 'Audit Data', href: '/upload' },
    { label: 'About', href: '/about' },
  ]

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 h-16 bg-white/70 backdrop-blur-2xl border-b border-white/80 shadow-[0_8px_30px_rgba(38,48,40,0.07)] transition-colors duration-300">
        <div className="container max-w-7xl mx-auto h-full px-6 flex items-center justify-between gap-4">
          
          {/* Brand Logo & Name */}
          <Link href="/" className="flex items-center gap-3 group flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-white/65 border border-white shadow-[0_5px_16px_rgba(38,48,40,0.12),inset_0_1px_0_white] backdrop-blur-xl flex items-center justify-center transition-all duration-300 group-hover:border-[#b7c1b7]">
              <svg width="20" height="20" viewBox="0 0 80 80" fill="none">
                <path d="M40 8L72 24V32C72 52 58 68 40 72C22 68 8 52 8 32V24L40 8Z"
                  stroke="rgba(81,101,85,0.9)" strokeWidth="2" fill="rgba(103,126,105,0.14)" />
                <path d="M26 40L35 49L54 30" stroke="rgba(81,101,85,1)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-medium tracking-[0.04em] text-lg text-[#202722] leading-none">A.U.R.A</span>
              <span className="text-[9px] tracking-[1.5px] uppercase text-[#657869] font-light mt-0.5 hidden sm:inline-block">Assessment & Grading</span>
            </div>
          </Link>

          {/* Center: 3D adaptive pill on Home page, or clean route indicators on other pages */}
          <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center justify-center">
            {isHome ? (
              <PillBase />
            ) : (
              <div className="flex items-center gap-6 text-xs uppercase tracking-[1.5px]">
                <Link href="/" className="text-zinc-600 hover:text-zinc-950 transition-colors">Home</Link>
                <Link href="/submit" className={`transition-colors ${pathname === '/submit' ? 'text-[#405746] font-semibold' : 'text-zinc-600 hover:text-zinc-950'}`}>Submit</Link>
                <Link href="/dashboard" className={`transition-colors ${pathname === '/dashboard' ? 'text-[#405746] font-semibold' : 'text-zinc-600 hover:text-zinc-950'}`}>Dashboard</Link>
                <Link href="/upload" className={`transition-colors ${pathname === '/upload' ? 'text-[#405746] font-semibold' : 'text-zinc-600 hover:text-zinc-950'}`}>Audit Data</Link>
                <Link href="/about" className={`transition-colors ${pathname === '/about' ? 'text-[#405746] font-semibold' : 'text-zinc-600 hover:text-zinc-950'}`}>About</Link>
              </div>
            )}
          </div>

          {/* Right Action Buttons (Desktop) */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            <Link href="/submit">
              <button className="px-4 py-2 text-xs uppercase tracking-[1.5px] font-semibold border border-white/70 bg-[#34473a]/90 hover:bg-[#26372c] text-white rounded-lg backdrop-blur-2xl shadow-[0_8px_20px_rgba(35,53,40,0.20),inset_0_1px_0_rgba(255,255,255,0.28)] transition-all flex items-center gap-1.5 cursor-pointer">
                <span>Student Portal</span>
                <ArrowUpRight size={12} className="opacity-70" />
              </button>
            </Link>
            <Link href="/dashboard">
              <button className="px-4 py-2 text-xs uppercase tracking-[1.5px] border border-white/90 bg-white/55 hover:bg-white/85 text-zinc-700 hover:text-zinc-950 rounded-lg backdrop-blur-2xl shadow-[0_6px_18px_rgba(45,55,47,0.09),inset_0_1px_0_white] transition-all cursor-pointer">
                Instructor
              </button>
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex lg:hidden items-center">
            <button
              onClick={() => setMobileOpen(prev => !prev)}
              className="p-2 text-zinc-700 hover:text-zinc-950 focus:outline-none rounded-lg bg-white/65 border border-white shadow-[0_6px_18px_rgba(45,55,47,0.10)] backdrop-blur-xl"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileOpen && (
          <div className="lg:hidden bg-white/90 backdrop-blur-2xl border-b border-white px-6 py-6 space-y-4 shadow-[0_16px_32px_rgba(38,48,40,0.12)]">
            <div className="flex flex-col space-y-3">
              {navLinks.map(link => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm uppercase tracking-[1.5px] text-zinc-700 hover:text-[#405746] py-1 transition-colors flex items-center justify-between"
                >
                  <span>{link.label}</span>
                  <ArrowUpRight size={14} className="opacity-50" />
                </Link>
              ))}
            </div>

            <div className="pt-4 border-t border-zinc-200 grid grid-cols-2 gap-3">
              <Link href="/submit" onClick={() => setMobileOpen(false)}>
                <button className="w-full py-2.5 text-xs uppercase tracking-[1px] border border-white/70 bg-[#34473a] text-white rounded-lg shadow-[0_8px_18px_rgba(35,53,40,0.18)] text-center">
                  Student Portal
                </button>
              </Link>
              <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                <button className="w-full py-2.5 text-xs uppercase tracking-[1px] border border-white bg-white/65 backdrop-blur-xl shadow-[0_6px_16px_rgba(45,55,47,0.08)] text-zinc-700 rounded-lg text-center">
                  Instructor
                </button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Spacer so pages don't get hidden behind the 16px fixed header */}
      <div className="h-16" />
    </>
  )
}
