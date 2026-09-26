"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, useTransform, useSpring, useMotionValue } from "framer-motion";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, ChevronDown } from "lucide-react";

// --- Types ---
export type AnimationPhase = "scatter" | "line" | "circle" | "bottom-strip";

interface CardData {
    badge: string;
    title: string;
    desc: string;
    src: string;
}

interface FlipCardProps {
    src: string;
    index: number;
    total: number;
    phase: AnimationPhase;
    target: { x: number; y: number; rotation: number; scale: number; opacity: number };
    data: CardData;
}

// --- FlipCard Component ---
const IMG_WIDTH = 74;
const IMG_HEIGHT = 104;

function FlipCard({
    src,
    index,
    total,
    phase,
    target,
    data,
}: FlipCardProps) {
    return (
        <motion.div
            animate={{
                x: target.x,
                y: target.y,
                rotate: target.rotation,
                scale: target.scale,
                opacity: target.opacity,
            }}
            transition={{
                type: "spring",
                stiffness: 45,
                damping: 16,
            }}
            style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                marginLeft: -IMG_WIDTH / 2,
                marginTop: -IMG_HEIGHT / 2,
                width: IMG_WIDTH,
                height: IMG_HEIGHT,
                transformStyle: "preserve-3d",
                perspective: "1000px",
            }}
            className="cursor-pointer group z-20"
        >
            <motion.div
                className="relative h-full w-full"
                style={{ transformStyle: "preserve-3d" }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                whileHover={{ rotateY: 180, scale: 1.1 }}
            >
                {/* Front Face with Local Asset Image */}
                <div
                    className="absolute inset-0 h-full w-full overflow-hidden rounded-xl shadow-[0_18px_38px_rgba(28,32,29,0.24),inset_0_1px_0_rgba(255,255,255,0.6)] bg-zinc-900 border border-white/40 transition-all duration-300 group-hover:border-white/80 group-hover:shadow-[0_22px_44px_rgba(28,32,29,0.34)]"
                    style={{ backfaceVisibility: "hidden" }}
                >
                    <img
                        src={src}
                        alt={data.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                    <div className="absolute bottom-1.5 inset-x-1 text-center pointer-events-none">
                        <span className="text-[7.5px] font-semibold tracking-wider text-white uppercase drop-shadow block truncate">
                            {data.badge}
                        </span>
                    </div>
                </div>

                {/* Back Face (A.U.R.A Feature Details) */}
                <div
                    className="absolute inset-0 h-full w-full overflow-hidden rounded-xl shadow-[0_18px_38px_rgba(28,32,29,0.24)] bg-gradient-to-b from-[#f8faf8] to-[#e7ece8] flex flex-col items-center justify-between p-2 border border-white/90 text-center select-none"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                    <div className="w-full">
                        <p className="text-[7px] font-bold text-[#52685a] uppercase tracking-widest truncate mb-0.5">
                            {data.badge}
                        </p>
                        <p className="text-[8.5px] font-semibold text-zinc-900 leading-tight line-clamp-2">
                            {data.title}
                        </p>
                    </div>
                    <p className="text-[6.5px] text-zinc-600 leading-snug line-clamp-3">
                        {data.desc}
                    </p>
                    <div className="w-full pt-1 border-t border-zinc-300 flex items-center justify-center gap-0.5 text-[6.5px] text-[#52685a] font-medium">
                        <span>A.U.R.A</span>
                        <ShieldCheck size={7} />
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

// --- Main Hero Component ---
const TOTAL_IMAGES = 20;
// Calibrated scroll range so morph is smooth and lets the user continue scrolling down continuously
const MORPH_RANGE = 350;
const MAX_SCROLL = 800;

// Curated hero images copied from the workspace asset folder.
const ASSET_IMAGES = [
    "/assets-images/1896d38fc88d3e8e4fe207b634db7adb.jpg",
    "/assets-images/3263c4118b6c9d2c6f76f0a3fc5f1de3.jpg",
    "/assets-images/32ad6cf8a223d3e34c5221d37247d2a1.jpg",
    "/assets-images/5d7bff57db807bbc6d6e131e83095aa8.jpg",
    "/assets-images/6b2385ff127888079606ee81768613ac.jpg",
    "/assets-images/91787601df1a065f5ec36b05dee80914.jpg",
    "/assets-images/ad999afaf9b76dff9bdb926be8440079.jpg",
    "/assets-images/bb78969b80d3b4df6ccd4c3e2bc10de8.jpg",
    "/assets-images/df3dd2401cdb782ddafd88fdc558750d.jpg",
    "/assets-images/download.jpg",
    "/assets-images/1d5ac9deef7ca5ffb6177d4f34e8d2b4.jpg",
    "/assets-images/256b94a6c39718b3500713b1e8001dbe.jpg",
    "/assets-images/352e6fa8ffec371ae43b8904a963a72b.jpg",
    "/assets-images/5b64857cebd160faed3368c815517094.jpg",
    "/assets-images/85cf64246ae0d8a698d958983e5e48b6.jpg",
    "/assets-images/c12b93d4e6e62977fc378016d14d60a0.jpg",
    "/assets-images/f3df716f62b7ec0212c1dc197b963e62.jpg",
];

// Seventeen distinct images fill the 20-card loop; three relevant images recur near the end.
const CARD_DATA: CardData[] = [
    {
        badge: "98.4% Acc",
        title: "AI Text Classifier",
        desc: "RoBERTa neural ensemble flags AI generated essays.",
        src: ASSET_IMAGES[0],
    },
    {
        badge: "Burstiness",
        title: "Perplexity Engine",
        desc: "Detects machine sentence cadence & token entropy.",
        src: ASSET_IMAGES[1],
    },
    {
        badge: "Semantic Sim",
        title: "Plagiarism Index",
        desc: "Cosine similarity across academic repositories.",
        src: ASSET_IMAGES[2],
    },
    {
        badge: "Demographic",
        title: "Bias Audit Layer",
        desc: "Audits false-positives against non-native writing.",
        src: ASSET_IMAGES[3],
    },
    {
        badge: "Auto-Grade",
        title: "Rubric LLM",
        desc: "Automated criterion scoring with feedback.",
        src: ASSET_IMAGES[4],
    },
    {
        badge: "Forensics",
        title: "FFT Frequency Scan",
        desc: "Catches GAN & diffusion artifacts in images.",
        src: ASSET_IMAGES[5],
    },
    {
        badge: "Tamper-Proof",
        title: "Audit Ledger",
        desc: "Cryptographically hashed decisions in SHA-256.",
        src: ASSET_IMAGES[12],
    },
    {
        badge: "Attribution",
        title: "Citation Verified",
        desc: "Validates bibliography references against databases.",
        src: ASSET_IMAGES[7],
    },
    {
        badge: "Deepfake",
        title: "Facial Geometry",
        desc: "Examines landmark drift & biological signals in video.",
        src: ASSET_IMAGES[8],
    },
    {
        badge: "Line-by-Line",
        title: "Code Verifier",
        desc: "AST and token analysis for generated programming tasks.",
        src: ASSET_IMAGES[9],
    },
    {
        badge: "Human Loop",
        title: "Override Studio",
        desc: "Instructors can review, approve, or escalate flags.",
        src: ASSET_IMAGES[10],
    },
    {
        badge: "ERP Ready",
        title: "REST & Webhook",
        desc: "Integrates with university portals and LMS.",
        src: ASSET_IMAGES[14],
    },
    {
        badge: "Explainable",
        title: "Visual Rationale",
        desc: "Sentence level confidence breakdown with colors.",
        src: ASSET_IMAGES[11],
    },
    {
        badge: "Privacy",
        title: "FERPA Protected",
        desc: "Zero retention storage for sensitive student files.",
        src: ASSET_IMAGES[13],
    },
    {
        badge: "Multi-Modal",
        title: "Universal Upload",
        desc: "Accepts PDF, DOCX, TXT, Code, MP4, and JPG.",
        src: ASSET_IMAGES[6],
    },
    {
        badge: "Real-Time",
        title: "Fast Execution",
        desc: "Distributed edge processing delivers instant scores.",
        src: ASSET_IMAGES[16],
    },
    {
        badge: "Coaching",
        title: "Growth Feedback",
        desc: "Generates constructive advice for academic progress.",
        src: ASSET_IMAGES[15],
    },
    {
        badge: "Consistency",
        title: "Temporal Drift",
        desc: "Frame-to-frame coherence check on video presentations.",
        src: ASSET_IMAGES[3],
    },
    {
        badge: "Accuracy",
        title: "Ensemble Voting",
        desc: "4 complementary ML algorithms cast weighted votes.",
        src: ASSET_IMAGES[5],
    },
    {
        badge: "Fairness",
        title: "Verified Pipeline",
        desc: "Guaranteed demographic fairness before decisions.",
        src: ASSET_IMAGES[12],
    },
];

const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

export default function ScrollMorphHero() {
    const [introPhase, setIntroPhase] = useState<AnimationPhase>("scatter");
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Glowing Cursor Spotlight
    const spotlightRef = useRef<HTMLDivElement>(null);

    // --- Container Size ---
    useEffect(() => {
        if (!containerRef.current) return;

        const handleResize = (entries: ResizeObserverEntry[]) => {
            for (const entry of entries) {
                setContainerSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        };

        const observer = new ResizeObserver(handleResize);
        observer.observe(containerRef.current);

        setContainerSize({
            width: containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight,
        });

        return () => observer.disconnect();
    }, []);

    // --- Virtual Scroll Logic with Unblocked Continuous Page Scrolling ---
    const virtualScroll = useMotionValue(0);
    const scrollRef = useRef(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            // If the user has already scrolled down into the page, let standard scrolling work freely
            if (window.scrollY > 15) {
                return;
            }

            // User is at the top of the page
            if (e.deltaY > 0) {
                // Scrolling Down
                if (scrollRef.current < MAX_SCROLL) {
                    // Still within hero morph and card shuffle: intercept and drive hero animation
                    e.preventDefault();
                    const newScroll = Math.min(scrollRef.current + e.deltaY * 0.9, MAX_SCROLL);
                    scrollRef.current = newScroll;
                    virtualScroll.set(newScroll);
                } else {
                    // Hero animation complete: DO NOT call preventDefault!
                    // Browser naturally scrolls down continuously to the next sections!
                }
            } else if (e.deltaY < 0) {
                // Scrolling Up
                if (window.scrollY <= 10 && scrollRef.current > 0) {
                    // At top of page: reverse the hero animation smoothly
                    e.preventDefault();
                    const newScroll = Math.max(scrollRef.current + e.deltaY * 0.9, 0);
                    scrollRef.current = newScroll;
                    virtualScroll.set(newScroll);
                }
            }
        };

        // Touch handling
        let touchStartY = 0;
        const handleTouchStart = (e: TouchEvent) => {
            touchStartY = e.touches[0].clientY;
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (window.scrollY > 15) return;

            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;
            touchStartY = touchY;

            if (deltaY > 0) {
                // Swiping up to scroll down
                if (scrollRef.current < MAX_SCROLL) {
                    e.preventDefault();
                    const newScroll = Math.min(scrollRef.current + deltaY * 1.2, MAX_SCROLL);
                    scrollRef.current = newScroll;
                    virtualScroll.set(newScroll);
                }
            } else if (deltaY < 0) {
                // Swiping down to scroll up
                if (window.scrollY <= 10 && scrollRef.current > 0) {
                    e.preventDefault();
                    const newScroll = Math.max(scrollRef.current + deltaY * 1.2, 0);
                    scrollRef.current = newScroll;
                    virtualScroll.set(newScroll);
                }
            }
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        container.addEventListener("touchstart", handleTouchStart, { passive: false });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });

        return () => {
            container.removeEventListener("wheel", handleWheel);
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
        };
    }, [virtualScroll]);

    // 1. Morph Progress: 0 (Circle) -> 1 (Rainbow Arc) across [0, MORPH_RANGE]
    const morphProgress = useTransform(virtualScroll, [0, MORPH_RANGE], [0, 1]);
    const smoothMorph = useSpring(morphProgress, { stiffness: 45, damping: 22 });

    // 2. Scroll Rotation (Card Shuffle across Arc) across [MORPH_RANGE, MAX_SCROLL]
    const scrollRotate = useTransform(virtualScroll, [MORPH_RANGE, MAX_SCROLL], [0, 360]);
    const smoothScrollRotate = useSpring(scrollRotate, { stiffness: 45, damping: 22 });

    // --- Mouse Parallax & Dynamic Spotlight ---
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const relativeX = e.clientX - rect.left;
            const relativeY = e.clientY - rect.top;

            if (spotlightRef.current) {
                spotlightRef.current.style.transform = `translate(${relativeX - 190}px, ${relativeY - 190}px)`;
                spotlightRef.current.style.opacity = "1";
            }

        };

        const handleMouseLeave = () => {
            if (spotlightRef.current) spotlightRef.current.style.opacity = "0";
        };

        container.addEventListener("mousemove", handleMouseMove);
        container.addEventListener("mouseleave", handleMouseLeave);
        return () => {
            container.removeEventListener("mousemove", handleMouseMove);
            container.removeEventListener("mouseleave", handleMouseLeave);
        };
    }, []);

    // --- Intro Sequence ---
    useEffect(() => {
        const timer1 = setTimeout(() => setIntroPhase("line"), 500);
        const timer2 = setTimeout(() => setIntroPhase("circle"), 2200);
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, []);

    // --- Random Scatter Positions ---
    const scatterPositions = useMemo(() => {
        return CARD_DATA.map(() => ({
            x: (Math.random() - 0.5) * 1500,
            y: (Math.random() - 0.5) * 1000,
            rotation: (Math.random() - 0.5) * 180,
            scale: 0.6,
            opacity: 0,
        }));
    }, []);

    const [morphValue, setMorphValue] = useState(0);
    const [rotateValue, setRotateValue] = useState(0);
    useEffect(() => {
        const unsubscribeMorph = smoothMorph.on("change", setMorphValue);
        const unsubscribeRotate = smoothScrollRotate.on("change", setRotateValue);
        return () => {
            unsubscribeMorph();
            unsubscribeRotate();
        };
    }, [smoothMorph, smoothScrollRotate]);

    const contentOpacity = useTransform(smoothMorph, [0.75, 1], [0, 1]);
    const contentY = useTransform(smoothMorph, [0.75, 1], [25, 0]);

    // Smooth scroll down to next section
    const scrollToFeatures = () => {
        const element = document.getElementById("features");
        if (element) {
            element.scrollIntoView({ behavior: "smooth" });
        } else {
            window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
        }
    };

    return (
        <div 
            id="home"
            ref={containerRef} 
            className="relative w-full h-[calc(100svh-4rem)] min-h-[560px] bg-[#f8f9f7] overflow-hidden select-none"
        >
            {/* Ambient Background Grid */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-70"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(24,24,27,0.035) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(24,24,27,0.035) 1px, transparent 1px)
                    `,
                    backgroundSize: '70px 70px'
                }}
            />

            {/* Glowing Cursor Aura Follower */}
            <div ref={spotlightRef} className="absolute left-0 top-0 pointer-events-none transition-opacity duration-300 z-10 opacity-0" style={{ width: 420, height: 420, background: 'radial-gradient(circle, rgba(128,145,130,0.16) 0%, rgba(201,208,196,0.11) 42%, transparent 72%)', filter: 'blur(34px)' }} />

            {/* Main Stage */}
            <div className="flex h-full w-full flex-col items-center justify-center perspective-1000 relative z-20">

                {/* Intro Text (Fades out when scrolling) */}
                    <div className="absolute z-30 flex flex-col items-center justify-center text-center pointer-events-none top-[1%] px-6">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={introPhase === "circle" && morphValue < 0.5 ? { opacity: 1 - morphValue * 2, scale: 1 } : { opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/90 bg-white/55 mb-5 backdrop-blur-xl shadow-[0_8px_24px_rgba(45,55,47,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]"
                    >
                        <Sparkles size={12} className="text-[#637767]" />
                        <span className="text-[10px] font-medium tracking-[2.5px] uppercase text-[#526457]">
                            Autonomous Integrity Pipeline
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                        animate={introPhase === "circle" && morphValue < 0.5 ? { opacity: 1 - morphValue * 2, y: 0, filter: "blur(0px)" } : { opacity: 0, filter: "blur(10px)" }}
                        transition={{ duration: 1 }}
                        className="font-serif text-5xl md:text-7xl font-medium tracking-[0.02em] text-zinc-900"
                    >
                        A.U.R.A
                    </motion.h1>

                </div>

                {/* Arc Active Content: A.U.R.A Hero Heading & CTAs (Fades in) */}
                <motion.div
                    style={{ opacity: contentOpacity, y: contentY }}
                    className="absolute top-[8%] md:top-[10%] z-30 flex flex-col items-center justify-center text-center px-6 max-w-4xl"
                >
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/90 bg-white/55 backdrop-blur-xl mb-5 shadow-[0_8px_24px_rgba(45,55,47,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#718576] animate-pulse" />
                        <span className="text-[10px] tracking-[2.5px] uppercase text-[#526457] font-semibold">
                            Assessment & Understanding Report Automation
                        </span>
                    </div>

                    <h1 className="font-serif text-6xl md:text-8xl font-medium text-[#202722] tracking-[0.02em] mb-3 drop-shadow-[0_8px_20px_rgba(38,48,40,0.12)]">
                        A.U.R.A
                    </h1>

                    <p className="text-sm md:text-base text-zinc-600 max-w-2xl leading-relaxed mb-6 font-light">
                        Multi-modal AI detection, semantic plagiarism indexing, demographic bias auditing, and explainable rubric auto-grading in a unified autonomous platform.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-4 pointer-events-auto">
                        <Link href="/submit">
                            <button className="px-8 py-3.5 text-xs uppercase tracking-[1.6px] font-semibold border border-white/70 bg-[#34473a]/90 hover:bg-[#26372c] text-white rounded-xl backdrop-blur-2xl transition-all duration-300 hover:-translate-y-0.5 shadow-[0_12px_28px_rgba(35,53,40,0.24),inset_0_1px_0_rgba(255,255,255,0.3)] flex items-center gap-2 cursor-pointer">
                                <span>Submit Work</span>
                                <ArrowRight size={13} />
                            </button>
                        </Link>
                        <Link href="/dashboard">
                            <button className="px-8 py-3.5 text-xs uppercase tracking-[1.6px] font-medium border border-white/90 bg-white/55 hover:bg-white/80 text-zinc-700 rounded-xl backdrop-blur-2xl transition-all duration-300 hover:-translate-y-0.5 shadow-[0_10px_25px_rgba(45,55,47,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] cursor-pointer">
                                Instructor Dashboard
                            </button>
                        </Link>
                    </div>

                    <p className="text-[10px] text-zinc-500 tracking-wider uppercase mt-4">
                        💡 Hover cards to inspect verified signals • Scroll down to continue
                    </p>
                </motion.div>

                {/* Bottom Scroll Indicator Button */}
                <div className="absolute bottom-5 inset-x-0 z-30 flex justify-center pointer-events-auto">
                    <button
                        onClick={scrollToFeatures}
                        className="group flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer py-2.5 px-5 rounded-full bg-white/55 border border-white/90 hover:border-[#aeb9af] backdrop-blur-2xl shadow-[0_10px_28px_rgba(45,55,47,0.10),inset_0_1px_0_rgba(255,255,255,0.95)]"
                        aria-label="Scroll to features"
                    >
                        <span className="text-[9px] tracking-[2px] uppercase text-[#657869] group-hover:text-[#34473a]">
                            Explore Platform Features
                        </span>
                        <ChevronDown size={14} className="animate-bounce text-[#526457]" />
                    </button>
                </div>

                {/* Cards Stage Container */}
                <div className="relative flex items-center justify-center w-full h-full pointer-events-none">
                    <div className="pointer-events-auto">
                        {CARD_DATA.slice(0, TOTAL_IMAGES).map((data, i) => {
                            let target = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

                            if (introPhase === "scatter") {
                                target = scatterPositions[i];
                            } else if (introPhase === "line") {
                                const lineSpacing = 76;
                                const lineX = i * lineSpacing - ((TOTAL_IMAGES - 1) * lineSpacing) / 2;
                                target = { x: lineX, y: 0, rotation: 0, scale: 1, opacity: 1 };
                            } else {
                                const isMobile = containerSize.width < 768;
                                const minDimension = Math.min(containerSize.width, containerSize.height);

                                // A. Calculate Circle Position
                                const circleRadius = Math.min(minDimension * 0.26, 300);
                                const circleAngle = (i / TOTAL_IMAGES) * 360;
                                const circleRad = (circleAngle * Math.PI) / 180;
                                const circlePos = {
                                    x: Math.cos(circleRad) * circleRadius,
                                    y: Math.sin(circleRad) * circleRadius + containerSize.height * 0.09,
                                    rotation: circleAngle + 90,
                                };

                                // B. Calculate Rainbow Arch Position
                                const baseRadius = Math.min(containerSize.width, containerSize.height * 1.5);
                                const arcRadius = baseRadius * (isMobile ? 1.4 : 1.15);
                                const arcApexY = containerSize.height * (isMobile ? 0.38 : 0.28);
                                const arcCenterY = arcApexY + arcRadius;

                                const spreadAngle = isMobile ? 105 : 135;
                                const startAngle = -90 - (spreadAngle / 2);
                                const step = spreadAngle / (TOTAL_IMAGES - 1);

                                const scrollProgress = Math.min(Math.max(rotateValue / 360, 0), 1);
                                const maxRotation = spreadAngle * 0.8;
                                const boundedRotation = -scrollProgress * maxRotation;

                                const currentArcAngle = startAngle + (i * step) + boundedRotation;
                                const arcRad = (currentArcAngle * Math.PI) / 180;

                                const arcPos = {
                                    x: Math.cos(arcRad) * arcRadius,
                                    y: Math.sin(arcRad) * arcRadius + arcCenterY,
                                    rotation: currentArcAngle + 90,
                                    scale: isMobile ? 1.35 : 1.7,
                                };

                                // C. Interpolate (Morph)
                                target = {
                                    x: lerp(circlePos.x, arcPos.x, morphValue),
                                    y: lerp(circlePos.y, arcPos.y, morphValue),
                                    rotation: lerp(circlePos.rotation, arcPos.rotation, morphValue),
                                    scale: lerp(isMobile ? 0.7 : 0.88, arcPos.scale, morphValue),
                                    opacity: 1,
                                };
                            }

                            return (
                                <FlipCard
                                    key={i}
                                    src={data.src}
                                    data={data}
                                    index={i}
                                    total={TOTAL_IMAGES}
                                    phase={introPhase}
                                    target={target}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
