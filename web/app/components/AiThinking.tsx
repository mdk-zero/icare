"use client";

import { useEffect, useState } from "react";
import { EcgLoader } from "./EcgLoader";

/** Long enough to read a short phrase, short enough that a wait feels busy. */
const PHRASE_MS = 2200;

/**
 * Stands in for an AI answer while it is being written: a short phrase that
 * changes every couple of seconds, so a slow model call reads as work in
 * progress rather than as a page that stalled — which a skeleton, sitting
 * still for ten seconds, can look like.
 *
 * Screen readers get one stable announcement (`label`); the rotating phrases
 * are decoration and stay hidden from them, or they'd be read out every swap.
 */
export default function AiThinking({
  phrases,
  label,
  className = "",
}: {
  phrases: readonly string[];
  label: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % phrases.length), PHRASE_MS);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-xl border border-dashed border-brand-600/30 bg-brand-600/5 px-4 py-3 ${className}`}
    >
      <EcgLoader size="md" className="shrink-0 text-brand-600" />
      <span className="sr-only">{label}</span>
      {/* Keyed on the index so each phrase mounts fresh and plays the fade. */}
      <span key={index} aria-hidden className="animate-phrase-in text-sm font-medium text-gray-700">
        {phrases[index]}
      </span>
    </div>
  );
}
