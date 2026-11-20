"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBell,
  faBullhorn,
  faChevronRight,
  faCircleCheck,
  faCircleInfo,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import PageHeader from "./PageHeader";
import AccessRequestActions from "./AccessRequestActions";
import GradeEditRequestActions from "./GradeEditRequestActions";
import { useNotifications } from "../lib/notifications-live";
import { fetchNotification, type FacultyNotification } from "../lib/api";
import { notificationLink, type NotificationPortal } from "../lib/notification-links";

const TYPE_META: Record<FacultyNotification["type"], { icon: IconDefinition; chip: string; label: string }> = {
  alert: { icon: faTriangleExclamation, chip: "bg-red-500/10 text-red-600 dark:text-red-300", label: "Alert" },
  warning: { icon: faTriangleExclamation, chip: "bg-amber-500/10 text-amber-600 dark:text-amber-300", label: "Warning" },
  success: { icon: faCircleCheck, chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", label: "Update" },
  info: { icon: faCircleInfo, chip: "bg-blue-500/10 text-blue-600 dark:text-blue-300", label: "Update" },
};

const ANNOUNCEMENT_META = { icon: faBullhorn, chip: "bg-teal-500/10 text-teal-600 dark:text-teal-300", label: "Announcement" };

/** A vital signs alert's findings, as the student's reading raised them. */
interface Finding {
  message: string;
  severity?: string;
  recommendation?: string | null;
}

function findingsOf(data: Record<string, unknown> | undefined): Finding[] {
  if (!Array.isArray(data?.reasons)) return [];
  return data.reasons.flatMap((r) => {
    const f = r as Record<string, unknown>;
    return typeof f.message === "string"
      ? [{ message: f.message, severity: typeof f.severity === "string" ? f.severity : undefined, recommendation: typeof f.recommendation === "string" ? f.recommendation : null }]
      : [];
  });
}

/**
 * One notification as a page of its own: the whole message, when it came,
 * its Accept and Decline where it asks for a decision, and a button to the
 * page it is about. Opening it marks it read. Read from the live feed, so a
 * decision made elsewhere shows at once; one the feed doesn't hold (a link
 * opened cold, or older than the newest 100) is fetched on its own.
 */
export default function NotificationDetail({ portal }: { portal: NotificationPortal }) {
  const { id } = useParams<{ id: string }>();
  const listHref = `/${portal}/notifications`;
  const { notifications, loading, markRead } = useNotifications();
  const live = notifications.find((n) => n.id === id) ?? null;
  // Kept with its id: moving to another notification's page reuses this one.
  const [fetched, setFetched] = useState<{ id: string; notification: FacultyNotification | null } | null>(null);
  const got = fetched?.id === id ? fetched : null;
  const notification = live ?? got?.notification ?? null;
  const markedRef = useRef<string | null>(null);

  // Not in the feed once it has loaded: ask for this one.
  useEffect(() => {
    if (loading || live || got) return;
    let current = true;
    void fetchNotification(id).then((n) => {
      if (current) setFetched({ id, notification: n });
    });
    return () => {
      current = false;
    };
  }, [id, loading, live, got]);

  // Opening it reads it, once.
  useEffect(() => {
    if (!notification || notification.is_read || markedRef.current === notification.id) return;
    markedRef.current = notification.id;
    void markRead(notification.id);
  }, [notification, markRead]);

  const back = (
    <Link
      href={listHref}
      className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-foreground/60 transition-colors hover:text-brand-700"
    >
      <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
      Back to notifications
    </Link>
  );

  if (!notification) {
    const waiting = loading || !got;
    return (
      <div>
        {back}
        {waiting ? (
          <div className="max-w-3xl animate-pulse space-y-3 rounded-2xl border border-hairline bg-surface p-6">
            <div className="h-6 w-2/3 rounded bg-gray-100" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-5/6 rounded bg-gray-100" />
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-hairline bg-surface/60 px-6 py-16 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-subtle text-foreground/40">
              <FontAwesomeIcon icon={faBell} className="h-6 w-6" />
            </div>
            <p className="font-display text-lg font-semibold text-foreground">Notification not found</p>
            <p className="mt-1 max-w-sm text-sm text-foreground/50">
              It may have been removed, or it belongs to another account.
            </p>
          </div>
        )}
      </div>
    );
  }

  const meta = notification.announcement ? ANNOUNCEMENT_META : (TYPE_META[notification.type] ?? TYPE_META.info);
  const link = notificationLink(notification.data, portal);
  const findings = findingsOf(notification.data);

  return (
    <div>
      {back}
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBell} className="h-3.5 w-3.5" />, label: "Notification" }}
        title={notification.title}
        subtitle={`${meta.label} · ${formatWhen(notification.created_at)}`}
      />

      <article className="max-w-3xl rounded-2xl border border-hairline bg-surface p-6 shadow-tile">
        <div className="flex items-start gap-4">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta.chip}`}>
            <FontAwesomeIcon icon={meta.icon} className="h-5 w-5" />
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-line pt-1.5 text-[15px] leading-relaxed text-foreground/80">
            {notification.message || "This notification has no message."}
          </p>
        </div>

        {findings.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-4">
            <h2 className="mb-2.5 text-sm font-semibold text-foreground">What was flagged</h2>
            <ul className="space-y-2">
              {findings.map((f, i) => (
                <li key={i} className="rounded-xl border border-hairline bg-subtle px-3.5 py-2.5 text-sm">
                  <p className="text-foreground/80">
                    {f.severity && (
                      <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
                        {f.severity}
                      </span>
                    )}
                    {f.message}
                  </p>
                  {f.recommendation && <p className="mt-1 text-xs text-foreground/55">{f.recommendation}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(notification.access_request || notification.grade_edit_request || link) && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
            {notification.access_request && (
              <AccessRequestActions notificationId={notification.id} request={notification.access_request} />
            )}
            {notification.grade_edit_request && <GradeEditRequestActions request={notification.grade_edit_request} />}
            {link && (
              <Link
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                {link.label}
                <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

/** "Monday, November 16, 2026 at 9:30 AM". */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}
