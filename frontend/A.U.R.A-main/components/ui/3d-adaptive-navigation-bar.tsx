"use client"
import React, { useState, useRef, useEffect } from 'react'
import { motion, useSpring, AnimatePresence } from 'framer-motion'

interface NavItem {
    label: string
    id: string
}

/**
 * Translucent navigation pill
 * Smart navigation with scroll detection and hover expansion
 */
export const PillBase: React.FC = () => {
    const [activeSection, setActiveSection] = useState('home')
    const [expanded, setExpanded] = useState(false)
    const [hovering, setHovering] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prevSectionRef = useRef('home')

    const navItems: NavItem[] = [
        { label: 'Home', id: 'home' },
        { label: 'Features', id: 'features' },
        { label: 'Pipeline', id: 'how-it-works' },
        { label: 'About', id: 'about' },
    ]

    // Spring animations for smooth motion
    const pillWidth = useSpring(130, { stiffness: 220, damping: 25, mass: 1 })
    const pillShift = useSpring(0, { stiffness: 220, damping: 25, mass: 1 })

    // Scroll detection
    useEffect(() => {
        if (isTransitioning) return;

        const checkFeaturesActive = () => {
            const featuresSection = document.getElementById('features');
            const isFeaturesPinned = featuresSection?.getAttribute('data-features-active') === 'true';
            
            if (isFeaturesPinned && activeSection !== 'features') {
                setActiveSection('features');
            }
        };

        const observerOptions = {
            root: null,
            rootMargin: '-50px 0px -50px 0px',
            threshold: Array.from({ length: 101 }, (_, i) => i / 100)
        };

        const observerCallback = (entries: IntersectionObserverEntry[]) => {
            checkFeaturesActive();
            
            const featuresSection = document.getElementById('features');
            const isFeaturesPinned = featuresSection?.getAttribute('data-features-active') === 'true';
            if (isFeaturesPinned) return;

            const maxEntry = entries.reduce<IntersectionObserverEntry | null>((best, entry) => {
                if (entry.target.id === 'features' || !entry.isIntersecting) return best;
                return !best || entry.intersectionRatio > best.intersectionRatio ? entry : best;
            }, null);

            if (maxEntry && maxEntry.intersectionRatio > 0.05) {
                setActiveSection(maxEntry.target.id);
            }
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);

        navItems.forEach(item => {
            const element = document.getElementById(item.id);
            if (element) observer.observe(element);
        });

        return () => {
            observer.disconnect();
        };
    }, [isTransitioning, activeSection]);

    // Handle hover expansion
    useEffect(() => {
        if (hovering) {
            setExpanded(true)
            pillWidth.set(380)
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current)
            }
        } else {
            hoverTimeoutRef.current = setTimeout(() => {
                setExpanded(false)
                pillWidth.set(130)
            }, 450)
        }

        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current)
            }
        }
    }, [hovering, pillWidth])

    const handleMouseEnter = () => setHovering(true)
    const handleMouseLeave = () => setHovering(false)

    const handleSectionClick = (sectionId: string) => {
        setIsTransitioning(true)
        prevSectionRef.current = sectionId
        setActiveSection(sectionId)
        setHovering(false)

        if (sectionId === 'about') {
            window.location.href = '/about';
            return;
        }

        if (sectionId !== 'home') {
            const element = document.getElementById(sectionId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        setTimeout(() => {
            setIsTransitioning(false)
        }, 400)
    }

    const activeItem = navItems.find(item => item.id === activeSection)

    return (
        <motion.nav
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="relative rounded-full pointer-events-auto select-none backdrop-blur-2xl"
            style={{
                width: pillWidth,
                height: '46px',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.88) 0%, rgba(241,244,240,0.72) 100%)',
                border: '1px solid rgba(255,255,255,0.94)',
                boxShadow: expanded
                    ? '0 18px 44px rgba(36, 49, 39, 0.18), 0 4px 12px rgba(36,49,39,0.08), inset 0 1px 1px rgba(255, 255, 255, 0.98)'
                    : '0 12px 30px rgba(36, 49, 39, 0.14), 0 3px 8px rgba(36,49,39,0.06), inset 0 1px 1px rgba(255, 255, 255, 0.98)',
                x: pillShift,
                overflow: 'hidden',
                transition: 'box-shadow 0.3s ease-out, border-color 0.3s ease-out',
            }}
        >
            {/* Top rim highlight */}
            <div
                className="absolute inset-x-0 top-0 rounded-t-full pointer-events-none"
                style={{
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(122,143,125,0.18) 30%, rgba(122,143,125,0.4) 70%, transparent 100%)',
                }}
            />

            {/* Navigation items container */}
            <div
                ref={containerRef}
                className="relative z-10 h-full flex items-center justify-center px-4"
            >
                {/* Collapsed state - show active item with glow */}
                {!expanded && (
                    <div className="flex items-center justify-center">
                        <AnimatePresence mode="wait">
                            {activeItem && (
                                <motion.span
                                    key={activeItem.id}
                                    initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
                                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                                    transition={{ duration: 0.25 }}
                                    className="text-xs font-semibold text-[#344239] tracking-[1.5px] uppercase flex items-center gap-1.5"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#718576] inline-block animate-pulse" />
                                    {activeItem.label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* Expanded state - show all sections */}
                {expanded && (
                    <div className="flex items-center justify-evenly w-full gap-2">
                        {navItems.map((item, index) => {
                            const isActive = item.id === activeSection

                            return (
                                <motion.button
                                    key={item.id}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05, duration: 0.2 }}
                                    onClick={() => handleSectionClick(item.id)}
                                    className={`relative px-3 py-1.5 rounded-full text-xs uppercase tracking-[1px] transition-all duration-200 cursor-pointer ${
                                        isActive
                                            ? 'text-[#344239] font-semibold bg-white/80 shadow-[0_4px_12px_rgba(36,49,39,0.12),inset_0_1px_0_white] border border-white'
                                            : 'text-zinc-600 hover:text-zinc-950 hover:bg-white/55'
                                    }`}
                                >
                                    {item.label}
                                </motion.button>
                            )
                        })}
                    </div>
                )}
            </div>
        </motion.nav>
    )
}
