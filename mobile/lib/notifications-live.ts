/**
 * Live notification feed for the mobile app (server-sent events).
 *
 * The web API exposes /api/notifications/stream, which holds the Supabase
 * Realtime subscription server-side and pushes each change down as an SSE
 * event. React Native has no EventSource, and `fetch` here can't stream a
 * response body, so the stream is read off an XMLHttpRequest's growing
 * `responseText` — which is also how the bearer token gets attached (an
 * EventSource can't set headers).
 *
 * One module-level store feeds both the header bell badge and the
 * notifications screen, so a notification written by faculty shows up on
 * both without a pull-to-refresh.
 */

import { AppState, AppStateStatus } from 'react-native';
import { API_URL, getToken } from './client';
import { AppNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from './api';

export interface NotificationsState {
  notifications: AppNotification[];
  unread: number;
  /** True until the first load resolves. */
  loading: boolean;
  /** True while the SSE connection is open. */
  connected: boolean;
  /** True when the list came from the offline cache. */
  fromCache: boolean;
  error: string | null;
}

const MAX_ITEMS = 100;
const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;

const EMPTY: NotificationsState = {
  notifications: [],
  unread: 0,
  loading: true,
  connected: false,
  fromCache: false,
  error: null,
};

let state: NotificationsState = EMPTY;
const listeners = new Set<() => void>();

let request: XMLHttpRequest | null = null;
/** Offset of `responseText` already parsed on the current request. */
let consumed = 0;
let pending = '';
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let appStateBound = false;
let stopped = false;

// ---------------------------------------------------------------
// Store
// ---------------------------------------------------------------

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<NotificationsState>) {
  state = { ...state, ...patch };
  emit();
}

function countUnread(notifications: AppNotification[]) {
  return notifications.filter((n) => !n.read_at).length;
}

function setList(notifications: AppNotification[], fromCache = false) {
  setState({
    notifications,
    unread: countUnread(notifications),
    loading: false,
    fromCache,
    error: null,
  });
}

export function subscribeNotifications(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotificationsSnapshot() {
  return state;
}

// ---------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------

function applyUpsert(notification: AppNotification) {
  const index = state.notifications.findIndex((n) => n.id === notification.id);
  if (index >= 0) {
    const next = [...state.notifications];
    next[index] = notification;
    setList(next);
    return;
  }
  setList([notification, ...state.notifications].slice(0, MAX_ITEMS));
}

function handleEvent(event: string, data: string) {
  if (!data) return;
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }

  if (event === 'snapshot') {
    const { notifications } = payload as { notifications?: AppNotification[] };
    setList(notifications ?? []);
    return;
  }
  if (event === 'insert' || event === 'update') {
    const { notification } = payload as { notification?: AppNotification };
    if (notification?.id) applyUpsert(notification);
    return;
  }
  if (event === 'delete') {
    const { id } = payload as { id?: string };
    if (id) setList(state.notifications.filter((n) => n.id !== id));
  }
}

/** Consume whole SSE blocks (separated by a blank line) from the buffer. */
function parseBuffer() {
  let boundary = pending.indexOf('\n\n');
  while (boundary !== -1) {
    const block = pending.slice(0, boundary);
    pending = pending.slice(boundary + 2);

    let event = 'message';
    let data = '';
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      // Comments (the keepalive heartbeat) and `retry:` carry no payload.
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    handleEvent(event, data);

    boundary = pending.indexOf('\n\n');
  }
}

function drain(source: XMLHttpRequest) {
  const text = source.responseText ?? '';
  if (text.length <= consumed) return;
  pending += text.slice(consumed);
  consumed = text.length;
  parseBuffer();
}

// ---------------------------------------------------------------
// Connection
// ---------------------------------------------------------------

function scheduleReconnect() {
  if (retryTimer || stopped) return;
  const delay = Math.min(BASE_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, delay);
}

function teardown() {
  if (!request) return;
  const current = request;
  request = null;
  current.onreadystatechange = null;
  current.abort();
}

async function connect() {
  if (stopped || request) return;

  const token = await getToken();
  if (!token) return;
  // A stop() or a second connect() may have landed while awaiting the token.
  if (stopped || request) return;

  const source = new XMLHttpRequest();
  consumed = 0;
  pending = '';

  source.open('GET', `${API_URL}/api/notifications/stream`);
  source.setRequestHeader('Authorization', `Bearer ${token}`);
  source.setRequestHeader('Accept', 'text/event-stream');
  source.setRequestHeader('Cache-Control', 'no-cache');

  source.onreadystatechange = () => {
    // Ignore a request we've already replaced or aborted.
    if (source !== request) return;

    if (source.readyState === source.HEADERS_RECEIVED && source.status === 200) {
      attempt = 0;
      setState({ connected: true });
      return;
    }

    if (source.readyState === source.LOADING) {
      drain(source);
      return;
    }

    if (source.readyState === source.DONE) {
      drain(source);
      request = null;
      setState({ connected: false });
      // The session is gone; reconnecting would just 401 in a loop. A fresh
      // sign-in calls startNotificationStream() again.
      if (source.status === 401) return;
      scheduleReconnect();
    }
  };

  request = source;
  try {
    source.send();
  } catch {
    request = null;
    scheduleReconnect();
  }
}

/**
 * Starts (or resumes) the live feed. Safe to call on every mount: an open
 * connection is left alone.
 */
export function startNotificationStream() {
  stopped = false;
  if (state.loading) void refreshNotifications();
  void connect();

  if (!appStateBound) {
    appStateBound = true;
    // The OS suspends sockets in the background; drop the stream on the way
    // out and re-sync on the way back in.
    AppState.addEventListener('change', (status: AppStateStatus) => {
      if (stopped) return;
      if (status === 'active') {
        void connect();
        void refreshNotifications();
      } else {
        teardown();
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        setState({ connected: false });
      }
    });
  }
}

/** Tears the feed down and clears state — for sign-out. */
export function stopNotificationStream() {
  stopped = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  teardown();
  attempt = 0;
  state = EMPTY;
  emit();
}

// ---------------------------------------------------------------
// Actions
// ---------------------------------------------------------------

/** One-shot read; falls back to the offline cache when the network is down. */
export async function refreshNotifications() {
  try {
    const result = await fetchNotifications();
    setList(result.data.notifications ?? [], result.fromCache);
  } catch (err) {
    setState({
      loading: false,
      error: err instanceof Error ? err.message : 'Something went wrong',
    });
  }
}

export async function markRead(id: string) {
  const target = state.notifications.find((n) => n.id === id);
  if (!target || target.read_at) return;
  const readAt = new Date().toISOString();
  setList(state.notifications.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)));
  try {
    await markNotificationRead(id);
  } catch {
    await refreshNotifications();
  }
}

export async function markAllRead() {
  if (state.unread === 0) return;
  const readAt = new Date().toISOString();
  setList(state.notifications.map((n) => (n.read_at ? n : { ...n, read_at: readAt })));
  try {
    await markAllNotificationsRead();
  } catch {
    await refreshNotifications();
  }
}
