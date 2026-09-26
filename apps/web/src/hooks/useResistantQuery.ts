import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

interface ResistantQueryResult<T> {
  data: T | null;
  loading: boolean;
  isPending: boolean;
  error: string | null;
  retry: () => void;
  invalidateCache: () => void;
}

export function useResistantQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  ttl = 30_000,
): ResistantQueryResult<T> {
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => {
    return ['resistantQuery', fetcher.toString(), ...deps];
  }, [deps, fetcher]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: fetcher,
    staleTime: ttl,
    gcTime: ttl + 300_000,
    retry: 3,
  });

  return {
    data: (data as T) ?? null,
    loading: isLoading || isFetching,
    isPending: isFetching,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    retry: () => void refetch(),
    invalidateCache: () => void queryClient.invalidateQueries({ queryKey }),
  };
}
