"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/upload', label: 'Submit' },
  { href: '/review', label: 'Review Queue' },
  { href: '/audit', label: 'Fairness Audit' },
]

/**
 * Lightweight wayfinding bar for AURA's utility pages (submit / review /
 * audit). The landing page's PillBase nav is scroll-anchor based (Home,
 * Features, Demo, Team) and makes no sense once you're off the single-page
 * scroller -- these pages hide it (see conditional-nav.tsx) and use this
 * instead, since without it there was no way to reach /review or /audit
 * except typing the URL directly.
 */
export default function UtilityNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 glass-card rounded-full px-2 py-2 flex items-center gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-4 py-2 rounded-full text-xs tracking-wide uppercase transition-colors ${
              active ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
