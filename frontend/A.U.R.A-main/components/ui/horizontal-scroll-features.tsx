"use client"

import { useRef, useEffect, useState } from "react"
import { Brain, ShieldCheck, FileSearch, BarChart3, Scale, FileText, Zap } from "lucide-react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

// Register ScrollTrigger plugin
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

const features = [
  {
    title: "AI Content Detection",
    description: "Multi-model ensemble detects AI-generated essays, images, and videos with sentence-level highlighting and confidence scoring.",
    tag: "Core",
    icon: Brain,
    color: "indigo",
  },
  {
    title: "Plagiarism Analysis",
    description: "Semantic similarity scan against academic corpora, previous submissions, and online sources — with exact source attribution.",
    tag: "Text",
    icon: FileSearch,
    color: "violet",
  },
  {
    title: "Explainable Reasoning",
    description: "Every flag comes with a human-readable explanation: which signals triggered, why the model flagged it, and how confident it is.",
    icon: FileText,
    color: "purple",
  },
  {
    title: "Bias Auditing",
    description: "Built-in fairness layer checks if non-native English speakers or specific demographics are disproportionately flagged before any action is taken.",
    tag: "Ethics",
    icon: Scale,
    color: "indigo",
  },
  {
    title: "Auto-Grading Engine",
    description: "Rubric-based LLM grading with section-by-section scoring and personalized feedback comments, not generic templates.",
    icon: BarChart3,
    color: "violet",
  },
  {
    title: "Media Submission Scan",
    description: "Deepfake detection for image and video attachments using facial forensics, frequency domain analysis, and temporal consistency tracking.",
    tag: "Media",
    icon: ShieldCheck,
    color: "purple",
  },
  {
    title: "Audit Trail",
    description: "Every analysis action is cryptographically logged and chained — tamper-proof records for every flagging and grading decision.",
    tag: "Security",
    icon: Zap,
    color: "indigo",
  },
]

const colorMap: Record<string, { icon: string; tag: string; glow: string; scanline: string }> = {
  indigo: {
    icon: "group-hover:text-indigo-400 group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.7)]",
    tag: "group-hover:bg-indigo-500/20 group-hover:text-indigo-400",
    glow: "via-indigo-500/10",
    scanline: "via-indigo-500/10",
  },
  violet: {
    icon: "group-hover:text-violet-400 group-hover:drop-shadow-[0_0_8px_rgba(139,92,246,0.7)]",
    tag: "group-hover:bg-violet-500/20 group-hover:text-violet-400",
    glow: "via-violet-500/10",
    scanline: "via-violet-500/10",
  },
  purple: {
    icon: "group-hover:text-purple-400 group-hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.7)]",
    tag: "group-hover:bg-purple-500/20 group-hover:text-purple-400",
    glow: "via-purple-500/10",
    scanline: "via-purple-500/10",
  },
}

export function HorizontalScrollFeatures() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardsContainerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile || !sectionRef.current || !cardsContainerRef.current) return

    const section = sectionRef.current
    const cardsContainer = cardsContainerRef.current

    const context = gsap.context(() => {
      const getScrollDistance = () => Math.max(0, cardsContainer.scrollWidth - window.innerWidth + 48)
      gsap.to(cardsContainer, {
        x: () => -getScrollDistance(),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          pin: true,
          scrub: 1,
          start: "top top",
          end: () => `+=${getScrollDistance()}`,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onEnter: () => section.setAttribute('data-features-active', 'true'),
          onLeave: () => section.setAttribute('data-features-active', 'false'),
          onEnterBack: () => section.setAttribute('data-features-active', 'true'),
          onLeaveBack: () => section.setAttribute('data-features-active', 'false'),
        },
      })
    }, section)

    return () => {
      context.revert()
    }
  }, [isMobile])

  if (isMobile) {
    return (
      <section id="features" className="py-20 px-6">
        <div className="container max-w-7xl mx-auto space-y-12">
          <div className="space-y-4 max-w-xl">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900">
              Everything an Institution <br />
              Needs.
            </h2>
            <p className="text-zinc-600 text-lg">
              Multi-layered academic integrity analysis — from AI detection to bias-audited grading.
            </p>
          </div>
          <div className="space-y-6">
            {features.map((feature, idx) => {
              const Icon = feature.icon
              const colors = colorMap[feature.color]
              return (
                <div key={idx} className="bg-white border border-zinc-200 rounded-lg p-8 hover:bg-zinc-50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="text-indigo-700"><Icon size={28} strokeWidth={1.5} /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-zinc-900">{feature.title}</h3>
                        {feature.tag && (
                          <span className="text-xs px-2 py-1 bg-zinc-100 text-zinc-700 rounded">{feature.tag}</span>
                        )}
                      </div>
                      <p className="text-zinc-600 text-sm leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="features" ref={sectionRef} className="relative h-screen overflow-hidden z-10">
      <div className="h-screen flex items-center">
        <div className="w-full">
          <div className="container max-w-7xl mx-auto px-6 mb-12">
            <div className="space-y-4 max-w-xl">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900">
                Everything an Institution <br />
                Needs.
              </h2>
              <p className="text-zinc-600 text-lg">
                Multi-layered academic integrity analysis — from AI detection to bias-audited grading.
              </p>
            </div>
          </div>

          <div className="overflow-hidden">
            <div
              ref={cardsContainerRef}
              className="flex gap-6 pl-6 md:pl-[calc((100vw-1280px)/2+1.5rem)]"
            >
              {features.map((feature, idx) => {
                const Icon = feature.icon
                const colors = colorMap[feature.color]
                return (
                  <div
                    key={idx}
                    className="group flex-shrink-0 w-[min(380px,calc(100vw-3rem))] bg-white border border-zinc-200 rounded-lg p-8 hover:bg-zinc-50 transition-colors relative overflow-hidden"
                  >
                    {/* Scanline effect */}
                    <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className={`absolute inset-0 bg-gradient-to-b from-transparent ${colors.scanline} to-transparent animate-scanline`} />
                    </div>

                    <div className="mb-6 relative">
                      <Icon
                        size={32}
                        className={`text-indigo-700 transition-all duration-300 ${colors.icon}`}
                        strokeWidth={1.5}
                      />
                      {/* Glitch layers */}
                      <Icon size={32} className="absolute top-0 left-0 text-red-500/40 opacity-0 group-hover:opacity-100 transition-opacity duration-75 group-hover:translate-x-[-2px] group-hover:translate-y-[-1px]" strokeWidth={1.5} />
                      <Icon size={32} className="absolute top-0 left-0 text-blue-500/40 opacity-0 group-hover:opacity-100 transition-opacity duration-75 group-hover:translate-x-[2px] group-hover:translate-y-[1px]" strokeWidth={1.5} />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="glitch-text text-2xl font-semibold text-white relative">
                          {feature.title}
                          <span className="glitch-text-layer" data-text={feature.title}></span>
                          <span className="glitch-text-layer" data-text={feature.title}></span>
                        </h3>
                        {feature.tag && (
                          <span className={`text-xs px-2 py-1 bg-white/10 text-white/70 rounded transition-colors ${colors.tag}`}>
                            {feature.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-base leading-relaxed group-hover:text-slate-300 transition-colors">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

<style jsx>{`
  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }
  .animate-scanline { animation: scanline 2s ease-in-out infinite; }

  .glitch-text { position: relative; display: inline-block; }
  .glitch-text-layer {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    opacity: 0; pointer-events: none;
  }
  .glitch-text-layer::before {
    content: attr(data-text);
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  }
  .glitch-text-layer:nth-child(1)::before { color: #ff0000; z-index: -1; }
  .glitch-text-layer:nth-child(2)::before { color: #6366f1; z-index: -2; }

  .group:hover .glitch-text-layer {
    opacity: 0.8;
    animation: glitch 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
  }
  .group:hover .glitch-text-layer:nth-child(1) { animation-delay: 0s; }
  .group:hover .glitch-text-layer:nth-child(2) { animation-delay: 0.1s; }

  @keyframes glitch {
    0% { clip-path: inset(40% 0 61% 0); transform: translate(-2px, -2px); }
    20% { clip-path: inset(92% 0 1% 0); transform: translate(2px, 2px); }
    40% { clip-path: inset(43% 0 1% 0); transform: translate(-2px, 2px); }
    60% { clip-path: inset(25% 0 58% 0); transform: translate(2px, -2px); }
    80% { clip-path: inset(54% 0 7% 0); transform: translate(-2px, 2px); }
    100% { clip-path: inset(58% 0 43% 0); transform: translate(2px, -2px); }
  }
`}</style>
