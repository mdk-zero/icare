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
  // retriggering the mount effect.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
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
    load();
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { data, loading, refreshing, error, fromCache, refresh, reload: load };
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
