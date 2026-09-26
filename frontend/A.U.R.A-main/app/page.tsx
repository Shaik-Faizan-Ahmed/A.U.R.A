"use client"

import HeroSection from "@/components/hero-section"
import dynamic from 'next/dynamic'
import Link from "next/link"

const HorizontalScrollFeatures = dynamic(
  () => import("@/components/ui/horizontal-scroll-features").then(mod => ({ default: mod.HorizontalScrollFeatures })),
  { ssr: false }
)

export default function Home() {
  return (
    <main className="light-surface min-h-screen selection:bg-indigo-100 overflow-x-hidden font-sans">
      <HeroSection />

      <HorizontalScrollFeatures />

      {/* How It Works */}
      <section id="how-it-works" className="relative py-28 px-6 bg-white overflow-hidden z-10">
        <div className="container max-w-6xl mx-auto text-center space-y-20">
          <div className="space-y-4">
            <p className="text-xs tracking-[4px] uppercase text-indigo-400/70 font-light">The Pipeline</p>
            <h2 className="text-4xl font-bold">How A.U.R.A Works.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              A three-step pipeline that scans, evaluates, and reports — with a human-in-the-loop review before any final decision.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              {
                step: "01",
                title: "Student Submits",
                desc: "Upload essay (PDF/DOCX), images, video attachments, or code files through the secure student portal.",
                color: "indigo",
              },
              {
                step: "02",
                title: "A.U.R.A Scans",
                desc: "Multi-layer pipeline runs: AI content detection, plagiarism check, bias audit, and LLM-powered rubric grading simultaneously.",
                color: "violet",
              },
              {
                step: "03",
                title: "Instructor Reviews",
                desc: "Dashboard shows confidence scores, flagged passages, bias audit badge, grade, and feedback. Approve, override, or escalate.",
                color: "purple",
              },
            ].map((item) => (
              <div key={item.step} className="relative bg-white border border-zinc-200 rounded-lg p-8 hover:bg-zinc-50 transition-colors group">
                <div className={`text-6xl font-bold mb-4 ${
                  item.color === 'indigo' ? 'text-indigo-500/20' :
                  item.color === 'violet' ? 'text-violet-500/20' : 'text-purple-500/20'
                } group-hover:${
                  item.color === 'indigo' ? 'text-indigo-500/30' :
                  item.color === 'violet' ? 'text-violet-500/30' : 'text-purple-500/30'
                } transition-colors font-space`}>{item.step}</div>
                <h3 className="text-xl font-semibold text-zinc-900 mb-3">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA section with AnimatedGradient background */}
      <section className="relative py-32 px-6 z-10 border-t border-zinc-200 overflow-hidden bg-white">
        <div className="container max-w-3xl mx-auto text-center space-y-8 relative z-10">
          <p className="text-xs tracking-[4px] uppercase text-indigo-300 font-medium">Get Started</p>
          <h2 className="text-4xl md:text-5xl font-bold text-zinc-900">
            Ready to automate <br /> your assessments?
          </h2>
          <p className="text-zinc-600 text-lg max-w-xl mx-auto">
            Submit your first assignment for AI integrity analysis, plagiarism scanning, and auto-grading.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/submit">
              <button className="px-10 py-4 text-[14px] font-medium tracking-[1.5px] uppercase border border-indigo-700 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer">
                Submit Now
              </button>
            </Link>
            <Link href="/dashboard">
              <button className="px-10 py-4 text-[14px] font-medium tracking-[1.5px] uppercase border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 rounded-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer">
                Instructor View
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer with animated gradient background accent */}
      <footer className="relative py-24 px-6 border-t border-zinc-200 bg-white overflow-hidden">
        <div className="container max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-2 gap-20">
            <div className="space-y-6">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-black/80 border border-indigo-500/40 flex items-center justify-center backdrop-blur-md">
                  <svg width="22" height="22" viewBox="0 0 80 80" fill="none">
                    <path d="M40 8L72 24V32C72 52 58 68 40 72C22 68 8 52 8 32V24L40 8Z"
                      stroke="rgba(139,92,246,0.9)" strokeWidth="2" fill="rgba(99,102,241,0.18)" />
                    <path d="M26 40L35 49L54 30" stroke="rgba(139,92,246,1)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                A.U.R.A
              </h2>
              <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
                Assessment & Understanding Report Automation — fair, explainable, and auditable academic integrity for the modern university.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-6">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest">Platform</h4>
                <ul className="space-y-4 text-sm text-slate-400">
                  <li className="hover:text-white cursor-pointer transition-colors"><Link href="/submit">Submit Work</Link></li>
                  <li className="hover:text-white cursor-pointer transition-colors"><Link href="/dashboard">Instructor Dashboard</Link></li>
                  <li className="hover:text-white cursor-pointer transition-colors"><Link href="/upload">Media Forensic Studio</Link></li>
                  <li className="hover:text-white cursor-pointer transition-colors"><Link href="/about">About & Mission</Link></li>
                </ul>
              </div>
              <div className="space-y-6">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest">Resources</h4>
                <ul className="space-y-4 text-sm text-slate-400">
                  <li className="hover:text-white cursor-pointer transition-colors">ERP API Documentation</li>
                  <li className="hover:text-white cursor-pointer transition-colors">Plagiarism Engine Whitepaper</li>
                  <li className="hover:text-white cursor-pointer transition-colors">Bias Auditing Framework</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-20 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-xs font-medium">
            <p>© 2026 A.U.R.A — Academic integrity, powered by AI.</p>
            <div className="flex gap-8">
              <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
              <span className="hover:text-white cursor-pointer transition-colors">Terms</span>
              <span className="hover:text-white cursor-pointer transition-colors">ERP API</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
