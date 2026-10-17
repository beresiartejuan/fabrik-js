'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { type ApiError, toApiError } from '@/lib/api/errors';

/**
 * Helper mínimo de fetch/estados (sin dependencias nuevas): `{ data, loading,
 * error, refetch }`. Los errores se normalizan a `ApiError`.
 *
 * El fetcher se guarda en un `ref`, así que no hace falta memoizarlo; el efecto
 * se re-ejecuta cuando cambian `deps` (o tras `refetch()`).
 */
export interface UseApiQueryResult<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: ApiError | null;
  readonly refetch: () => void;
}

export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // `deps` es provisto por el llamador: se propaga tal cual al efecto.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps es dinámico por diseño.
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setError(null);

    fetcherRef.current().then(
      (value) => {
        if (mountedRef.current) {
          setData(value);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (mountedRef.current) {
          setError(toApiError(cause));
          setLoading(false);
        }
      },
    );
  }, [reloadKey, ...deps]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return { data, loading, error, refetch };
}
