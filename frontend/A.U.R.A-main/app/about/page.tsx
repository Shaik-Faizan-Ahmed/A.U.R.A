"use client"

import Link from 'next/link'
import { Github, ArrowRight } from 'lucide-react'

const teamMembers = [
  {
    name: "Shaik Faizan Ahmed",
    role: "AI & Media Forensics",
    desc: "Leads AI detection, media forensics, and model evaluation for the verification pipeline.",
    img: "/images/faizan.webp",
    github: "https://github.com/Shaik-Faizan-Ahmed",
  },
  {
    name: "Harivalabha",
    role: "Product & Interface Design",
    desc: "Shapes the product experience, interface design, and clear user workflows.",
    img: "/images/harivalabha.webp",
  },
  {
    name: "Gurunantha",
    role: "Full-Stack Engineering",
    desc: "Builds application workflows, APIs, and integrations across the platform.",
    img: "/images/gurunantha.webp",
  },
  {
    name: "Vikas",
    role: "A.U.R.A Project Team",
    desc: "Contributes to the design and development of the A.U.R.A platform.",
    img: "/images/vikas.webp",
  },
]

export default function AboutPage() {
  return (
    <main id="about" className="light-surface min-h-screen overflow-x-hidden">

      <div className="relative z-10 container max-w-6xl mx-auto px-6 py-16 space-y-24">
        {/* Mission */}
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <p className="text-xs text-indigo-400/80 uppercase tracking-[4px] font-medium">Our Mission</p>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight text-white drop-shadow-md">
            Making academic assessments <br />
            <span className="text-indigo-400">fair, transparent, and fast.</span>
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed">
            A.U.R.A started as a hackathon project to solve a real problem: universities around the world are drowning in manual grading and struggling to keep up with AI-generated submissions. We built a platform that doesn't just detect AI content — it explains why, audits for bias, and auto-grades with full transparency.
          </p>
          <p className="text-slate-400 text-base leading-relaxed">
            Our vision is to become the trusted academic integrity layer for multi-billion dollar university ERP systems — accessible via a simple API integration.
          </p>
        </div>

        {/* What We Built */}
        <div className="space-y-10">
          <div className="text-center space-y-2">
            <p className="text-xs text-violet-400/80 uppercase tracking-[4px] font-medium">The Technology</p>
            <h2 className="text-3xl font-bold">Built on V.E.R.I.T.A.S</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm">
              A.U.R.A extends our previous hackathon project — a deepfake detector — into a full academic integrity engine.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "V.E.R.I.T.A.S Core",
                desc: "AI-generated image and video detection using ensemble deep learning models, facial forensics, and frequency domain analysis.",
                tag: "Inherited",
                color: "indigo",
              },
              {
                title: "Text AI Engine",
                desc: "RoBERTa-based classifier detects AI-written essays with sentence-level highlighting and perplexity scoring.",
                tag: "New",
                color: "violet",
              },
              {
                title: "Fairness Layer",
                desc: "Bias auditing module checks flagging decisions for demographic fairness before any academic action is taken.",
                tag: "New",
                color: "purple",
              },
            ].map(item => (
              <div key={item.title} className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    item.color === 'indigo' ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' :
                    item.color === 'violet' ? 'text-violet-400 bg-violet-500/10 border-violet-500/20' :
                    'text-purple-400 bg-purple-500/10 border-purple-500/20'
                  }`}>{item.tag}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div id="team" className="space-y-10">
          <div className="text-center space-y-2">
            <p className="text-xs text-purple-400/80 uppercase tracking-[4px] font-medium">The Team</p>
            <h2 className="text-3xl font-bold">Who Built A.U.R.A</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {teamMembers.map(member => (
              <article key={member.name} className="group overflow-hidden rounded-lg border border-zinc-200 bg-white transition-shadow hover:shadow-lg hover:shadow-zinc-900/10">
                <div className="aspect-[4/5] overflow-hidden bg-zinc-100">
                  <img
                    src={member.img}
                    alt={`${member.name}, ${member.role}`}
                    loading="lazy"
                    className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="space-y-2 p-5">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">{member.name}</h3>
                    <p className="text-sm font-medium text-indigo-700">{member.role}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-600">{member.desc}</p>
                {member.github && (
                  <a
                    href={member.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-700 transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <Github size={12} /> GitHub
                  </a>
                )}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="relative rounded-lg overflow-hidden border border-zinc-200 bg-white p-12 text-center space-y-6">
          <div className="relative z-10 space-y-4 max-w-xl mx-auto">
            <h2 className="text-3xl font-bold text-white">Ready to see it in action?</h2>
            <p className="text-slate-300 text-sm">
              Experience the full pipeline from student submission to bias-audited report generation.
            </p>
            <div className="flex flex-wrap gap-4 justify-center pt-2">
              <Link href="/submit">
                <button className="px-8 py-3.5 text-xs uppercase tracking-[1.5px] font-medium border border-indigo-400/50 bg-indigo-600/30 hover:bg-indigo-600/50 text-white rounded-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 shadow-[0_8px_20px_rgba(79,70,229,0.3)] flex items-center gap-2 cursor-pointer">
                  <span>Try Student Portal</span>
                  <ArrowRight size={14} />
                </button>
              </Link>
              <a
                href="https://github.com/Shaik-Faizan-Ahmed/genai-media-verifier"
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="px-8 py-3.5 text-xs uppercase tracking-[1.5px] border border-white/20 bg-black/40 hover:bg-white/10 text-white rounded-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer">
                  <Github size={14} /> View on GitHub
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
