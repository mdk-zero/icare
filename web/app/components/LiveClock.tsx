"use client";

import { useEffect, useState } from "react";

/** Rendered on the server and on the first client paint, so the two match. */
const PLACEHOLDER = "--:--:--";

function formatNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
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

  return (
    <time
      suppressHydrationWarning
      aria-label="Current time"
      className={`tabular-nums ${className}`}
    >
      {time ?? PLACEHOLDER}
    </time>
  );
}
