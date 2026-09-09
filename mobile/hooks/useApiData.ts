import { useCallback, useEffect, useRef, useState } from 'react';
import { CachedResult } from '@/lib/client';

/**
 * Load-on-mount + pull-to-refresh state for screens backed by the offline
 * cache (5.2). `fromCache` is true when the network was unreachable and the
 * data shown is the last cached copy.
 */
export function useApiData<T>(fetcher: () => Promise<CachedResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Screens pass inline (often composed) fetchers; keep the latest without
  // retriggering the mount effect. Written in an effect rather than during
  // render so the ref is never mutated while rendering.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Nothing before the first await touches state, so the mount effect below
  // cannot cascade a synchronous re-render.
  const reload = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result.data);
      setFromCache(result.fromCache);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // The spinner is raised here rather than inside reload: this runs from a
  // gesture, where a synchronous state write is the intended behaviour.
  const refresh = useCallback(() => {
    setRefreshing(true);
    reload();
  }, [reload]);

  return { data, loading, refreshing, error, fromCache, refresh, reload };
}

/** Combine several cached fetches into one result; stale if any part is. */
export async function allCached<T extends unknown[]>(
  ...results: { [K in keyof T]: Promise<CachedResult<T[K]>> }
): Promise<CachedResult<T>> {
  const settled = await Promise.all(results);
  return {
    data: settled.map((r) => r.data) as T,
    fromCache: settled.some((r) => r.fromCache),
    cachedAt: settled.find((r) => r.cachedAt)?.cachedAt ?? null,
  };
}
