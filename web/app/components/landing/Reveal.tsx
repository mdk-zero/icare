"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Fades its children up the first time they scroll into view. The motion lives
 * in `.lp-reveal` (globals.css) and keys off `data-revealed`, so descendants can
 * hang their own effects on the same moment — the How It Works trace draws
 * itself through `[data-revealed="true"] .lp-draw`.
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      // The bottom inset holds the reveal until the block is properly on
      // screen, rather than firing on its first visible pixel.
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-revealed={revealed}
      className={`lp-reveal ${className}`.trim()}
      style={{ "--lp-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
