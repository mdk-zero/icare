"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock } from "@fortawesome/free-solid-svg-icons";

/** Rendered on the server and on the first client paint, so the two match. */
const PLACEHOLDER = "--:--:-- --";

function formatNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = now.getHours();
  // 0 → 12 AM, 12 → 12 PM. Hours stay padded so the readout keeps a fixed
  // width and the surrounding chrome never reflows.
  const hour12 = hours % 12 || 12;
  return `${pad(hour12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * Live HH:MM:SS wall clock for the app chrome.
 *
 * The time is deliberately absent from the server render: the clock would
 * otherwise hydration-mismatch on every load. It fills in on mount instead.
 */
export default function LiveClock({ className = "" }: { className?: string }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    // Show the real time immediately, then tick. Each tick re-reads the clock,
    // so a throttled/slow interval never accumulates drift.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTime(formatNow());
    const id = setInterval(() => setTime(formatNow()), 1000);
    return () => clearInterval(id);
  }, []);

  // Display (inline-flex/hidden) is left to the caller so responsive variants
  // aren't fighting a display utility baked in here.
  return (
    <span className={className}>
      <FontAwesomeIcon icon={faClock} aria-hidden className="w-3 h-3 shrink-0 opacity-70" />
      <time suppressHydrationWarning aria-label="Current time" className="tabular-nums">
        {time ?? PLACEHOLDER}
      </time>
    </span>
  );
}
