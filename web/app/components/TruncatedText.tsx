"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType } from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const EDGE = 8;
const MAX_WIDTH = 420;

/**
 * Text on one line, cut with "…" when it doesn't fit, with the whole of it in
 * a tooltip on hover. For course titles, some of which run past 150
 * characters (NCM 112L, NCM 118L). The tooltip only appears when the text is
 * actually cut, and goes to document.body so a card's overflow can't clip it.
 * Screen readers read the whole text either way: only the drawing is cut.
 */
export default function TruncatedText({
  text,
  as: Tag = "span",
  className = "",
  style,
}: {
  text: string;
  /** The element to render, for a heading. Laid out as a block either way. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const [tip, setTip] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(MAX_WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE));
    // Below the text, or above it near the foot of the window.
    setTip(
      r.bottom + 120 > window.innerHeight
        ? { left, bottom: window.innerHeight - r.top + GAP, width }
        : { left, top: r.bottom + GAP, width },
    );
  };
  const hide = () => setTip(null);

  // A scroll moves the text out from under a tooltip placed by its old position.
  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tip]);

  return (
    <>
      <Tag
        ref={ref}
        className={`block min-w-0 truncate ${className}`}
        // Inline, because globals.css gives h1–h3 text-wrap: balance outside any
        // layer, which beats the truncate utility's nowrap on a heading.
        style={{ whiteSpace: "nowrap", ...style }}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {text}
      </Tag>
      {tip &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: tip.left, top: tip.top, bottom: tip.bottom, maxWidth: tip.width }}
            className="pointer-events-none fixed z-[100] w-max rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
