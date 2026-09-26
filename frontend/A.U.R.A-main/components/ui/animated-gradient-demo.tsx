"use client";

import AnimatedGradient from "@/components/ui/animated-gradient";

export default function AnimatedGradientDemo() {
  return (
    <div className="relative flex items-center justify-center min-h-[400px] p-8 rounded-3xl overflow-hidden border border-white/10">
      <AnimatedGradient config={{ preset: "Plasma" }} noise={{ opacity: 0.15 }} />
      <div className="relative z-10 text-center space-y-2">
        <h3 className="text-3xl font-bold tracking-wider text-white">A.U.R.A Visual Engine</h3>
        <p className="text-sm text-slate-300 font-light">Real-time WebGL Shader Gradient</p>
      </div>
    </div>
  );
}
