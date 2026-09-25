import { useRef, useState, useEffect, useCallback, useTransition } from 'react';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface ResistantQueryResult<T> {
  data: T | null;
  loading: boolean;
  isPending: boolean;
  error: string | null;
  retry: () => void;
  invalidateCache: () => void;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function makeCacheKey(fetcher: () => Promise<unknown>, deps: React.DependencyList): string {
  const depsKey = JSON.stringify(deps);
  const fnKey = fetcher.toString();
  return `${fnKey}:${depsKey}`;
}

export function useResistantQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  ttl = 30_000,
): ResistantQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fetcherRef = useRef<() => Promise<T>>(fetcher);
  const cacheKeyRef = useRef<string>('');
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const cacheKey = makeCacheKey(fetcher, deps);
  cacheKeyRef.current = cacheKey;

  const execute = useCallback((): void => {
    const key = cacheKeyRef.current;
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && cached.expiresAt > now) {
      startTransition(() => {
        setData(cached.data as T);
        setLoading(false);
        setError(null);
      });
      return;
    }

    const existingInFlight = inFlight.get(key);
    if (existingInFlight) {
      setLoading(true);
      existingInFlight
        .then((result) => {
          startTransition(() => {
            setData(result as T);
            setLoading(false);
            setError(null);
          });
        })
        .catch((err: unknown) => {
          startTransition(() => {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          });
        });
      return;
    }

    startTransition(() => {
      setLoading(true);
      setError(null);
    });

    const promise = fetcherRef.current();
    inFlight.set(key, promise);

    promise
      .then((result) => {
        cache.set(key, { data: result, expiresAt: now + ttl });
        startTransition(() => {
          setData(result as T);
          setLoading(false);
        });
      })
      .catch((err: unknown) => {
        startTransition(() => {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
      })
      .finally(() => {
        inFlight.delete(key);
      });
  }, [ttl]);

  const invalidateCache = useCallback((): void => {
    const key = cacheKeyRef.current;
    cache.delete(key);
    setData(null);
    setLoading(true);
  }, []);

  invalidateRef.current = invalidateCache;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) {
          cache.set(cacheKey, { data: result, expiresAt: Date.now() + ttl });
          startTransition(() => {
            setData(result);
            setLoading(false);
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          startTransition(() => {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          startTransition(() => {
            setLoading(false);
          });
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, deps);

  const isLoading = loading || isPending;

  return { data, loading: isLoading, isPending, error, retry: execute, invalidateCache };
}
