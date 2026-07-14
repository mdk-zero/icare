/**
 * HTTP core for the iCARE++ mobile app (Phase 5.1/5.3).
 *
 * - Bearer-token auth against the web app's API routes (the login route
 *   returns `sessionToken`; web `readSession()` accepts it as a bearer).
 * - Token storage: expo-secure-store on device, AsyncStorage on web.
 * - Read caching: successful GETs are cached; when the network is down the
 *   cached copy is served and marked stale (manuscript low-connectivity
 *   commitment).
 * - Write outbox: vitals/EHR writes made offline queue up and sync in order
 *   when connectivity returns. Server wins on rejection: a 4xx drops the
 *   queued item and surfaces the reason instead of retrying forever.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Android emulators reach the host machine at 10.0.2.2, not localhost.
// Physical devices still need EXPO_PUBLIC_API_URL set to the host's LAN IP.
const DEFAULT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

// `||` not `??`: an EXPO_PUBLIC_API_URL left empty in .env would otherwise
// override the platform default with "" and every request would fail.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

const TOKEN_KEY = 'icare_session_token';
const CACHE_PREFIX = '@icare_cache:';
const OUTBOX_KEY = '@icare_outbox';

// ---------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.setItem(TOKEN_KEY, token);
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(TOKEN_KEY);
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ---------------------------------------------------------------
// Connectivity (inferred from request outcomes; no NetInfo dependency)
// ---------------------------------------------------------------

let online = true;
const connectivityListeners = new Set<(online: boolean) => void>();

function setOnline(value: boolean) {
  if (online === value) return;
  online = value;
  for (const listener of connectivityListeners) listener(value);
}

export function isOnline(): boolean {
  return online;
}

export function subscribeConnectivity(listener: (online: boolean) => void): () => void {
  connectivityListeners.add(listener);
  return () => connectivityListeners.delete(listener);
}

// ---------------------------------------------------------------
// Requests
// ---------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  /** status 0 = network unreachable (candidate for the offline outbox) */
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

/**
 * Hosts that silently drop packets (wrong LAN IP, firewall, device on a
 * different network) leave fetch hanging forever; abort so callers fail
 * into their offline/error paths instead of spinning indefinitely.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    setOnline(false);
    throw new ApiError(
      controller.signal.aborted ? 'Request timed out' : 'Network unreachable',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
  setOnline(true);

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // non-JSON response body; fall through with null
  }

  if (!response.ok) {
    const message =
      json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string'
        ? ((json as { error: string }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return json as T;
}

// ---------------------------------------------------------------
// Cached reads
// ---------------------------------------------------------------

export interface CachedResult<T> {
  data: T;
  fromCache: boolean;
  cachedAt: string | null;
}

export async function cachedGet<T>(path: string): Promise<CachedResult<T>> {
  const cacheKey = CACHE_PREFIX + path;
  try {
    const data = await api<T>(path);
    AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ data, cachedAt: new Date().toISOString() }),
    ).catch(() => {});
    return { data, fromCache: false, cachedAt: null };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) throw err;
    const parsed = JSON.parse(raw) as { data: T; cachedAt: string };
    return { data: parsed.data, fromCache: true, cachedAt: parsed.cachedAt };
  }
}

// ---------------------------------------------------------------
// Offline write outbox
// ---------------------------------------------------------------

export interface OutboxItem {
  id: string;
  label: string;
  path: string;
  method: 'POST' | 'PATCH';
  body: unknown;
  createdAt: string;
}

export async function getOutbox(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
}

async function saveOutbox(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export async function enqueueWrite(item: Omit<OutboxItem, 'id' | 'createdAt'>): Promise<OutboxItem> {
  const queued: OutboxItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const outbox = await getOutbox();
  outbox.push(queued);
  await saveOutbox(outbox);
  return queued;
}

export interface FlushResult {
  sent: number;
  remaining: number;
  /** Items the server rejected (4xx) — dropped, with the reason. */
  rejected: { label: string; error: string }[];
}

/**
 * Send queued writes in order. Stops at the first network failure (still
 * offline); server-rejected items are dropped so one bad entry can't block
 * the queue.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const outbox = await getOutbox();
  const rejected: FlushResult['rejected'] = [];
  let sent = 0;

  while (outbox.length > 0) {
    const item = outbox[0];
    try {
      await api(item.path, { method: item.method, body: item.body });
      sent += 1;
      outbox.shift();
    } catch (err) {
      if (isNetworkError(err)) break;
      rejected.push({
        label: item.label,
        error: err instanceof Error ? err.message : 'Rejected by server',
      });
      outbox.shift();
    }
  }

  await saveOutbox(outbox);
  return { sent, remaining: outbox.length, rejected };
}

export async function clearCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(CACHE_PREFIX)));
}
