import { useRef, useState, useEffect, useCallback } from 'react';

interface ResistantQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useResistantQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
): ResistantQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Always store the latest fetcher in a ref so useEffect/useCallback never
  // capture a stale closure, without adding fetcher to their dependency arrays
  // (which would violate the rules of hooks if the reference changes every render).
  const fetcherRef = useRef<() => Promise<T>>(fetcher);

  // Keep ref in sync via a separate effect so it doesn't run as a render-phase
  // side effect (which can cause the hooks-order warning during HMR).
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, deps);
  /* eslint-enable react-hooks/exhaustive-deps */

  const execute = useCallback((): void => {
    setLoading(true);
    setError(null);
    void fetcherRef
      .current()
      .then((result) => {
        setData(result);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { data, loading, error, retry: execute };
}
