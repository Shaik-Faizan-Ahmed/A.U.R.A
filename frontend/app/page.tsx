"use client"

import { Button } from "@/components/ui/button"
import dynamic from 'next/dynamic'
import HeroSection from "@/components/hero-section"

const AnoAI = dynamic(() => import("@/components/ui/animated-shader-background"), { 
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-0 bg-gradient-to-br from-slate-900/50 to-transparent" />
  )
})

const SnowParticles = dynamic(
  () => import("@/components/ui/snow-particles").then(mod => ({ default: mod.SnowParticles })),
  { ssr: false }
)

const HorizontalScrollFeatures = dynamic(
  () => import("@/components/ui/horizontal-scroll-features").then(mod => ({ default: mod.HorizontalScrollFeatures })),
  { ssr: false }
)

export default function Home() {

  return (
    <main className="min-h-screen bg-black text-white selection:bg-cyan-500/30 overflow-x-hidden font-sans">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <AnoAI className="opacity-90" />
        <SnowParticles quantity={80} />
      </div>

      <HeroSection />

      <HorizontalScrollFeatures />

      <section id="demo" className="relative py-20 px-6 bg-[#050505] overflow-hidden z-10">
        <div className="container max-w-6xl mx-auto text-center space-y-16">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">Built for Innovation and Trust.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Watch how our platform simplifies the complex workflow of digital content verification.
            </p>
          </div>

          <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/5 bg-slate-900 shadow-[0_0_100px_rgba(0,0,0,1)] group cursor-pointer">
            <video
              className="w-full h-full object-cover"
              controls
              muted
              loop
              playsInline
              preload="metadata"
            >
              <source src="/demo-vid.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>


      <footer className="py-24 px-6 border-t border-white/5 bg-black">
        <div className="container max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-20">
            <div className="space-y-8">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <img src="/new-logo.jpeg" alt="AI Analyzer Logo" className="w-8 h-8 object-contain" loading="lazy" />
                V.E.R.I.T.A.S
              </h2>
              <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                Helping people make informed judgments about digital media.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-6">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest">Resources</h4>
                <ul className="space-y-4 text-sm text-slate-500">
                  <li className="hover:text-white cursor-pointer transition-colors">Documentation</li>
                  <li className="hover:text-white cursor-pointer transition-colors">API Reference</li>
                  <li className="hover:text-white cursor-pointer transition-colors">Security</li>
                </ul>
              </div>
              <div className="space-y-6">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest">Company</h4>
                <ul className="space-y-4 text-sm text-slate-500">
                  <li className="hover:text-white cursor-pointer transition-colors">About</li>
                  <li className="hover:text-white cursor-pointer transition-colors">Careers</li>
                  <li className="hover:text-white cursor-pointer transition-colors">Contact</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-24 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-600 text-xs font-medium">
            <p>© 2026 V.E.R.I.T.A.S — Media analysis to support informed judgment.</p>
            <div className="flex gap-8">
              <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
              <span className="hover:text-white cursor-pointer transition-colors">Terms</span>
              <span className="hover:text-white cursor-pointer transition-colors">Cookies</span>
            </div>
          </div>
        </div>
      </footer>


    </main>
  )
}
