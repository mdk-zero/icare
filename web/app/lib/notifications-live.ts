"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  FacultyNotification,
  ServerNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  toFacultyNotification,
} from "./api";

/**
 * One process-wide notification store fed by /api/notifications/stream.
 *
 * Every consumer (sidebar badge, student feed, faculty feed) reads the same
 * state off a single EventSource, so a notification inserted server-side
 * lands everywhere at once without a refresh — and marking one read updates
 * the badge in the same tick.
 */

export interface NotificationsState {
  notifications: FacultyNotification[];
  unread: number;
  /** True until the first snapshot (or failed fetch) resolves. */
  loading: boolean;
  /** True while the SSE connection is open. */
  connected: boolean;
}

const MAX_ITEMS = 100;

const EMPTY: NotificationsState = {
  notifications: [],
  unread: 0,
  loading: true,
  connected: false,
};

let state: NotificationsState = EMPTY;
const listeners = new Set<() => void>();
const arrivalListeners = new Set<(notification: FacultyNotification) => void>();

let source: EventSource | null = null;
let visibilityBound = false;
let stopped = false;

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<NotificationsState>) {
  state = { ...state, ...patch };
  emit();
}

function countUnread(notifications: FacultyNotification[]) {
  return notifications.filter((n) => !n.is_read).length;
}

function setList(notifications: FacultyNotification[]) {
  setState({ notifications, unread: countUnread(notifications), loading: false });
}

// ---------------------------------------------------------------
// Store plumbing
// ---------------------------------------------------------------

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

/** Rendered on the server before any stream exists. */
function getServerSnapshot() {
  return EMPTY;
}

/** Notifies on newly *arrived* notifications only (never on the initial load). */
export function onNotificationArrival(handler: (notification: FacultyNotification) => void) {
  arrivalListeners.add(handler);
  return () => {
    arrivalListeners.delete(handler);
  };
}

// ---------------------------------------------------------------
// Stream events
// ---------------------------------------------------------------

function applySnapshot(payload: { notifications?: ServerNotification[] }) {
  setList((payload.notifications ?? []).map(toFacultyNotification));
}

function applyUpsert(row: ServerNotification, announce: boolean) {
  const incoming = toFacultyNotification(row);
  const existing = state.notifications.findIndex((n) => n.id === incoming.id);

  if (existing >= 0) {
    const next = [...state.notifications];
    next[existing] = incoming;
    setList(next);
    return;
  }

  setList([incoming, ...state.notifications].slice(0, MAX_ITEMS));
  if (announce) {
    for (const handler of arrivalListeners) handler(incoming);
  }
}

function applyDelete(id: string) {
  setList(state.notifications.filter((n) => n.id !== id));
}

function parse<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// Connection
// ---------------------------------------------------------------

/**
 * Opens the stream if it isn't already open. Safe to call from every mount:
 * a live connection is reused, and a connection the browser gave up on
 * (e.g. the session expired) is replaced.
 */
export function startNotificationStream() {
  if (typeof window === "undefined") return;
  stopped = false;

  if (state.loading) void refreshNotifications();

  if (source && source.readyState !== EventSource.CLOSED) return;
  source?.close();

  const es = new EventSource("/api/notifications/stream", { withCredentials: true });
  source = es;

  es.addEventListener("open", () => setState({ connected: true }));

  es.addEventListener("snapshot", (event) => {
    const payload = parse<{ notifications: ServerNotification[]; unread: number }>(
      event as MessageEvent,
    );
    if (payload) applySnapshot(payload);
    setState({ connected: true });
  });

  es.addEventListener("insert", (event) => {
    const payload = parse<{ notification: ServerNotification }>(event as MessageEvent);
    if (payload?.notification) applyUpsert(payload.notification, true);
  });

  es.addEventListener("update", (event) => {
    const payload = parse<{ notification: ServerNotification }>(event as MessageEvent);
    if (payload?.notification) applyUpsert(payload.notification, false);
  });

  es.addEventListener("delete", (event) => {
    const payload = parse<{ id: string }>(event as MessageEvent);
    if (payload?.id) applyDelete(payload.id);
  });

  es.addEventListener("error", () => {
    setState({ connected: false });
    // EventSource retries on its own unless the response itself was rejected
    // (401 after a sign-out, say), which closes it for good.
  });

  if (!visibilityBound) {
    visibilityBound = true;
    // A closed stream can only be revived from the outside; the moment the tab
    // is looked at again is the moment it matters.
    document.addEventListener("visibilitychange", () => {
      if (stopped || document.visibilityState !== "visible") return;
      startNotificationStream();
      void refreshNotifications();
    });
  }
}

/** Drops the connection and clears state — for sign-out. */
export function stopNotificationStream() {
  stopped = true;
  source?.close();
  source = null;
  state = EMPTY;
  emit();
}

// ---------------------------------------------------------------
// Actions
// ---------------------------------------------------------------

/** One-shot read, used for the first paint and whenever the tab refocuses. */
export async function refreshNotifications() {
  const data = await fetchNotifications();
  if (!data) {
    setState({ loading: false });
    return;
  }
  setList(data.notifications);
}

export async function markRead(id: string) {
  const target = state.notifications.find((n) => n.id === id);
  if (!target || target.is_read) return;
  setList(state.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  const ok = await markNotificationRead(id);
  if (!ok) void refreshNotifications();
}

export async function markAllRead() {
  if (state.unread === 0) return;
  setList(state.notifications.map((n) => ({ ...n, is_read: true })));
  const ok = await markAllNotificationsRead();
  if (!ok) void refreshNotifications();
}

// ---------------------------------------------------------------
// Hook
// ---------------------------------------------------------------

export function useNotifications() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    startNotificationStream();
  }, []);

  return {
    ...snapshot,
    markRead,
    markAllRead,
    refresh: refreshNotifications,
  };
}
