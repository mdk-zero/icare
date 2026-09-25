"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle, faTimes, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "./EcgLoader";

type ToastType = "success" | "error" | "info" | "loading";

interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
  /** 0–1 for a loading toast that knows how far along it is. */
  progress?: number;
  /** Began as a loading toast, so its bar stays to finish filling. */
  wasLoading?: boolean;
}

let nextId = 0;
let addToastFn:
  | ((id: number, text: string, type: ToastType, durationMs: number, progress?: number) => void)
  | null = null;

/** `durationMs` is for a message too long to read in the default four seconds. */
export function toast(text: string, type: Exclude<ToastType, "loading"> = "success", durationMs = 4000) {
  addToastFn?.(nextId++, text, type, durationMs);
}

/**
 * A toast that stays up while something runs. `update` changes its text and,
 * given a 0–1 `progress`, fills a bar (for "Enrolling 3 of 10…");
 * `success` / `error` turn it into the ordinary toast for how it ended, which
 * then fades on the usual timer.
 */
export function loadingToast(text: string, progress?: number) {
  const id = nextId++;
  addToastFn?.(id, text, "loading", 0, progress);
  return {
    update: (next: string, fraction?: number) => addToastFn?.(id, next, "loading", 0, fraction),
    success: (next: string, durationMs = 5000) => addToastFn?.(id, next, "success", durationMs),
    error: (next: string, durationMs = 6000) => addToastFn?.(id, next, "error", durationMs),
  };
}

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    // Re-adding an id replaces that toast in place, which is how a loading
    // toast updates. A duration of 0 keeps it until the next replace.
    addToastFn = (id, text, type, durationMs, progress) => {
      setItems((prev) =>
        prev.some((t) => t.id === id)
          ? prev.map((t) => (t.id === id ? { id, text, type, progress, wasLoading: t.type === "loading" || t.wasLoading } : t))
          : [...prev, { id, text, type, progress }],
      );
      if (durationMs > 0) {
        setTimeout(() => {
          setItems((prev) => prev.filter((t) => !(t.id === id && t.text === text && t.type === type)));
        }, durationMs);
      }
    };
    return () => { addToastFn = null; };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border text-sm font-medium animate-[slideIn_0.3s_ease] ${
            item.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : item.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-brand-50 border-brand-200 text-brand-800"
          }`}
        >
          {item.type === "loading" ? (
            <EcgLoader size="xs" className="mt-0.5 shrink-0 text-brand-600" />
          ) : (
            <FontAwesomeIcon
              icon={item.type === "success" ? faCheckCircle : faInfoCircle}
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                item.type === "success" ? "text-green-500" : item.type === "error" ? "text-red-500" : "text-brand-500"
              }`}
            />
          )}
          <span className="flex-1">
            {item.text}
            {(item.type === "loading" || item.wasLoading) && (
              <ProgressBar
                progress={item.progress}
                outcome={item.type === "loading" ? null : item.type === "error" ? "error" : "success"}
              />
            )}
          </span>
          {item.type !== "loading" && (
            <button
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A bar that visibly fills. With a known `progress` it follows it; without
 * one it creeps forward on its own, slowing as it nears the end so it never
 * claims to be done early; when the work ends it runs the rest of the way.
 */
function ProgressBar({
  progress,
  outcome,
}: {
  progress: number | undefined;
  outcome: "success" | "error" | null;
}) {
  const [crept, setCrept] = useState(0.02);

  useEffect(() => {
    if (progress !== undefined || outcome) return;
    const timer = setInterval(() => setCrept((p) => p + (0.92 - p) * 0.12), 250);
    return () => clearInterval(timer);
  }, [progress, outcome]);

  const value = outcome ? 1 : progress !== undefined ? Math.min(Math.max(progress, 0), 1) : crept;
  const fill = outcome === "error" ? "bg-red-500" : outcome === "success" ? "bg-green-500" : "bg-brand-600";
  const track = outcome === "error" ? "bg-red-200/60" : outcome === "success" ? "bg-green-200/60" : "bg-brand-200/60";

  return (
    <span
      className={`mt-2 block h-1.5 w-56 max-w-full overflow-hidden rounded-full ${track}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <span
        className={`block h-full rounded-full transition-[width,background-color] duration-500 ease-out ${fill}`}
        style={{ width: `${value * 100}%` }}
      />
    </span>
  );
}
