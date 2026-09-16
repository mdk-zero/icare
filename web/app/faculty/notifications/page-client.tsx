"use client";

import { useMemo, useState } from "react";
import { useNotifications } from "../../lib/notifications-live";
import { FacultyNotification } from "../../lib/api";
import { SkeletonNotificationItem } from "../../components/skeletons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheck,
  faCheckDouble,
  faCircleCheck,
  faCircleInfo,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import PageHeader from "../../components/PageHeader";

type Filter = "all" | "unread" | "alert" | "warning";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "alert", label: "Alerts" },
  { key: "warning", label: "Warnings" },
];

const TYPE_META: Record<
  FacultyNotification["type"],
  { icon: IconDefinition; chip: string }
> = {
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

export default function FacultyNotificationsClient() {
  // Shared live store: inserts arrive over SSE and read state stays in step
  // with the sidebar badge.
  const {
    notifications,
    unread: unreadCount,
    loading,
    connected,
    markRead,
    markAllRead,
  } = useNotifications();

  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.is_read);
    if (filter === "alert" || filter === "warning") {
      return notifications.filter((n) => n.type === filter);
    }
    return notifications;
  }, [notifications, filter]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byDay = new Map<string, FacultyNotification[]>();
    for (const n of visible) {
      const key = dayKey(new Date(n.created_at));
      if (!byDay.has(key)) {
        byDay.set(key, []);
        order.push(key);
      }
      byDay.get(key)!.push(n);
    }
    return order.map((key) => ({ key, label: groupLabel(key), items: byDay.get(key)! }));
  }, [visible]);

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faBell} className="w-3.5 h-3.5" />,
          label: "Notifications",
        }}
        title="Notifications"
        subtitle={
          connected
            ? `Live alerts and updates${unreadCount > 0 ? ` · ${unreadCount} unread` : ""}`
            : "Alerts and updates · reconnecting…"
        }
        action={
          unreadCount > 0
            ? {
                icon: <FontAwesomeIcon icon={faCheckDouble} className="h-4 w-4" />,
                onClick: () => markAllRead(),
                label: `Mark all ${unreadCount} as read`,
                text: "Mark all read",
              }
            : undefined
        }
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonNotificationItem key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-hairline bg-surface/60 px-6 py-20 text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-subtle text-foreground/40">
            <FontAwesomeIcon icon={faBell} className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-semibold text-foreground">
            {notifications.length === 0 ? "All caught up" : "Nothing in this view"}
          </p>
          <p className="mt-1 max-w-xs text-sm text-foreground/50">
            {notifications.length === 0
              ? "New submissions, deadlines, and alerts from your students will land here as they happen."
              : `You don't have any ${filter === "unread" ? "unread" : filter} notifications right now.`}
          </p>
        </div>
      ) : (
        <div>
          {/* Filter + live status */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-brand-600 text-white shadow-tile"
                        : "border border-hairline bg-surface text-foreground/60 hover:border-brand-500/40 hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <LiveBadge connected={connected} />
          </div>

          <div className="space-y-7">
            {groups.map((group, gi) => (
              <section key={group.key}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">
                    {group.label}
                  </h2>
                  <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground/50">
                    {group.items.length}
                  </span>
                  <span className="h-px flex-1 bg-hairline" />
                </div>

                <div className="space-y-2.5">
                  {group.items.map((notification, i) => {
                    const meta = TYPE_META[notification.type] ?? TYPE_META.info;
                    const unread = !notification.is_read;
                    const delay = (gi * 6 + Math.min(i, 8)) * 35;
                    return (
                      <div
                        key={notification.id}
                        style={{ animationDelay: `${delay}ms` }}
                        className={`animate-rise rounded-2xl border p-4 shadow-tile transition-all hover:shadow-tile-hover ${
                          unread
                            ? "border-brand-500/30 bg-brand-500/[0.045]"
                            : "border-hairline bg-surface"
                        }`}
                      >
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.chip}`}
                          >
                            <FontAwesomeIcon icon={meta.icon} className="h-[18px] w-[18px]" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3
                                className={`min-w-0 truncate ${
                                  unread
                                    ? "font-semibold text-foreground"
                                    : "font-medium text-foreground/70"
                                }`}
                              >
                                {notification.title}
                              </h3>
                              {unread && (
                                <span
                                  title="Unread"
                                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                                />
                              )}
                            </div>
                            <p className="mt-0.5 text-sm leading-relaxed text-foreground/60">
                              {notification.message}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-foreground/40">
                                {formatTimestamp(notification.created_at)}
                              </span>
                              {unread && (
                                <button
                                  onClick={() => markRead(notification.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle px-2.5 py-1 text-xs font-medium text-foreground/60 transition-colors hover:border-brand-500/40 hover:bg-surface hover:text-brand-700 dark:hover:text-brand-300"
                                >
                                  <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                                  Mark read
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A quiet pulse that says the feed is keeping itself current. */
function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground/55"
      title={connected ? "Updating live" : "Reconnecting…"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "animate-pulse bg-emerald-500" : "bg-foreground/25"
        }`}
      />
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupLabel(key: string): string {
  const now = new Date();
  if (key === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday)) return "Yesterday";

  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (dayKey(d) === dayKey(now)) return `Today · ${time}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(
    [],
    sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" },
  );
  return `${date} · ${time}`;
}