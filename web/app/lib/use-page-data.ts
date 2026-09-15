"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  ensureLoaded,
  readPage,
  reloadPage,
  subscribePage,
  writePage,
} from "./request-cache";

/**
 * How long a loaded page is trusted on its own. Past this a revisit still
 * renders instantly from what is held, and the refresh runs behind the
 * already-visible page instead of a skeleton.
 */
const DEFAULT_FRESH_FOR_MS = 30_000;

export interface PageData<T> {
  /** Undefined only before the very first load of this key resolves. */
  data: T | undefined;
  /** True when there is nothing to render yet — the only time to show a skeleton. */
  loading: boolean;
  /** True while a refresh runs behind data that is already on screen. */
  revalidating: boolean;
  error: unknown;
  /** Refetches past both caches and updates every mounted reader of this key. */
  refresh: () => Promise<void>;
  /** Writes straight to the store, for optimistic edits after a mutation. */
  setData: (next: T | ((previous: T | undefined) => T)) => void;
}

/**
 * Loads a page's data once and keeps it, so navigating away and back is instant.
 *
 * The store is read synchronously during render rather than in an effect, which
 * is the whole point: `loading` is derived from whether the key has ever
 * resolved, so a revisit never flips back to a skeleton for a frame.
 *
 * `key` must encode everything `loader` reads — a filter, a search term, a
 * route param — because it is the only thing that separates one cached result
 * from another. `loader` may be a fresh closure on every render; scheduling is
 * idempotent, so re-running the effect costs nothing.
 */
export function usePageData<T>(
  key: string,
  loader: () => Promise<T>,
  options?: { freshFor?: number },
): PageData<T> {
  const freshFor = options?.freshFor ?? DEFAULT_FRESH_FOR_MS;

  const entry = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribePage(key, onChange), [key]),
    useCallback(() => readPage(key), [key]),
    () => undefined,
  );

  useEffect(() => {
    ensureLoaded(key, loader, freshFor);
  }, [key, loader, freshFor]);

  const refresh = useCallback(() => reloadPage(key, loader), [key, loader]);

  const setData = useCallback(
    (next: T | ((previous: T | undefined) => T)) => {
      const previous = readPage(key)?.data as T | undefined;
      writePage(
        key,
        typeof next === "function" ? (next as (p: T | undefined) => T)(previous) : next,
      );
    },
    [key],
  );

  return {
    data: entry?.data as T | undefined,
    loading: entry === undefined,
    revalidating: entry?.revalidating ?? false,
    error: entry?.error,
    refresh,
    setData,
  };
}
