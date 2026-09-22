"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheckDouble,
  faChevronRight,
  faCircleCheck,
  faCircleInfo,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { useNotifications } from "../lib/notifications-live";
import { FacultyNotification } from "../lib/api";

type Variant = "sidebar" | "topbar";

interface Anchor {
  top: number;
  left: number;
  width: number;
  caretLeft: number;
  /** True when the panel hangs below the trigger (caret on top). */
  down: boolean;
}

const TYPE_META: Record<FacultyNotification["type"], { icon: IconDefinition; chip: string }> = {
  alert: {
    icon: faTriangleExclamation,
    chip: "bg-red-500/10 text-red-600 dark:text-red-300",
  },
  warning: {
    icon: faTriangleExclamation,
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  success: {
    icon: faCircleCheck,
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  info: {
    icon: faCircleInfo,
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  },
};

const PANEL_HEIGHT = 430;

/**
 * The bell in the shell. Opens a Messenger-style notification cloud instead of
 * navigating straight to the page: the newest items first, then a "See all
 * notifications" link on the bottom. Pinned with createPortal so it can escape
 * the sidebar's clip. It stays glued to the bell while the page scrolls
 * (re-anchored on every scroll/resize, never dropped); it closes on the
 * backdrop, Escape, or the footer link — which routes first — and the
 * transparent backdrop blocks any other navigation while it is open.
 *
 * `onOpenChange` lets the collapsible sidebar hold itself open while the cloud
 * is up, since the cloud stays pointed at where the bell was when it opened.
 */
export default function NotificationsPopover({
  variant,
  onOpenChange,
}: {
  variant: Variant;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const { notifications, unread, loading, markRead, markAllRead } = useNotifications();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);

  const compute = (rect: DOMRect): Anchor => {
    const width = Math.min(368, window.innerWidth - 24);
    const spaceBelow = window.innerHeight - rect.bottom;
    const down = spaceBelow > PANEL_HEIGHT;
    const top = down ? rect.bottom + 8 : Math.max(12, rect.top - PANEL_HEIGHT - 8);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
    const caretLeft = Math.min(width - 18, Math.max(16, rect.left - left + rect.width / 2 - 6));
    return { top, left, width, caretLeft, down };
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;
    setAnchor(compute(el.getBoundingClientRect()));
    setOpen(true);
  };

  // Keep pointing at the bell as the content under it scrolls (and on resize).
  // Scroll events bubble from the app's own scroll containers, so this listens
  // with capture; the rAF throttle stops a burst from re-laying-out per pixel.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const reposition = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = triggerRef.current;
        if (el) setAnchor(compute(el.getBoundingClientRect()));
      });
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const goToAll = () => {
    setOpen(false);
    router.push("/faculty/notifications");
  };

  // Read items live on the notifications page only; the popup is for what
  // still needs attention.
  const preview = notifications.filter((n) => !n.is_read).slice(0, 5);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className={
          variant === "sidebar"
            ? "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] ring-1 ring-white/10 text-white/65 transition-all hover:text-white hover:bg-white/[0.11] hover:ring-white/20 outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b3d3d] cursor-pointer"
            : "relative p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-600/70 cursor-pointer"
        }
      >
        <FontAwesomeIcon
          icon={faBell}
          className={variant === "sidebar" ? "w-3.5 h-3.5" : "w-5 h-5"}
        />
        {unread > 0 && (
          <span
            className={`absolute flex min-w-[16px] h-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ${
              variant === "sidebar"
                ? "-top-0.5 -right-0.5 ring-2 ring-[#0b3d3d]"
                : "top-[2px] right-[2px] ring-2 ring-white"
            }`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="dialog"
              aria-label="Notifications"
              className="fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_28px_70px_-16px_rgba(4,32,31,0.55)] ring-1 ring-black/[0.06]"
              style={{
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                maxWidth: "calc(100vw - 1.5rem)",
                animation: "rise 0.26s cubic-bezier(0.22, 0.61, 0.36, 1)",
              }}
            >
              {/* Tail pointing at the bell. */}
              <span
                aria-hidden
                className="absolute h-2.5 w-2.5 rotate-45 rounded-[2px] bg-surface"
                style={{
                  top: anchor.down ? -5 : undefined,
                  bottom: anchor.down ? undefined : -5,
                  left: anchor.caretLeft,
                  borderTop: anchor.down ? "1px solid rgb(0 0 0 / 0.06)" : undefined,
                  borderLeft: anchor.down ? "1px solid rgb(0 0 0 / 0.06)" : undefined,
                  borderBottom: anchor.down ? undefined : "1px solid rgb(0 0 0 / 0.06)",
                  borderRight: anchor.down ? undefined : "1px solid rgb(0 0 0 / 0.06)",
                }}
              />

              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-foreground">
                  Notifications
                  {unread > 0 && (
                    <span className="rounded-full bg-brand-500/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                      {unread}
                    </span>
                  )}
                </h2>
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-500/10 dark:text-brand-300"
                  >
                    <FontAwesomeIcon icon={faCheckDouble} className="h-3 w-3" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* Feed */}
              <div className="max-h-[min(320px,55vh)] min-h-[120px] space-y-1.5 overflow-y-auto p-2 custom-scrollbar">
                {loading ? (
                  <div className="space-y-1.5 py-1.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex animate-pulse items-start gap-3 rounded-xl border border-hairline px-2.5 py-2.5"
                      >
                        <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-100" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-3/4 rounded bg-gray-100" />
                          <div className="h-2.5 w-full rounded bg-gray-100" />
                          <div className="h-2 w-16 rounded bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : preview.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl px-4 py-8 text-center">
                    <div className="mb-2.5 grid h-11 w-11 place-items-center rounded-2xl bg-subtle text-foreground/40">
                      <FontAwesomeIcon icon={faBell} className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">All caught up</p>
                    <p className="mt-0.5 text-xs text-foreground/50">
                      New alerts from your students will land here.
                    </p>
                  </div>
                ) : (
                  preview.map((notification, i) => {
                    const meta = TYPE_META[notification.type] ?? TYPE_META.info;
                    return (
                      <button
                        key={notification.id}
                        onClick={() => markRead(notification.id)}
                        style={{ animationDelay: `${Math.min(i, 5) * 30}ms` }}
                        className="flex w-full animate-rise items-start gap-2.5 rounded-xl bg-brand-500/[0.05] px-2.5 py-2.5 text-left transition-colors hover:bg-brand-500/[0.09]"
                      >
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${meta.chip}`}
                        >
                          <FontAwesomeIcon icon={meta.icon} className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug text-foreground">
                              {notification.title}
                            </span>
                            <span className="shrink-0 text-[11px] leading-none text-foreground/40">
                              {formatStamp(notification.created_at)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-foreground/55">
                            {notification.message}
                          </span>
                        </span>
                        <span
                          title="Unread"
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                        />
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <button
                onClick={goToAll}
                className="flex shrink-0 items-center justify-center gap-1.5 border-t border-hairline bg-subtle/60 px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-500/10 dark:text-brand-300"
              >
                See all notifications
                <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(
    [],
    sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" },
  );
  return `${date} · ${time}`;
}
