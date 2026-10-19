'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { type ApiError, toApiError } from '@/lib/api/errors';

/**
 * Helper mínimo de fetch/estados (sin dependencias nuevas): `{ data, loading,
 * error, refetch }`. Los errores se normalizan a `ApiError`.
 *
 * El fetcher se guarda en un `ref`, así que no hace falta memoizarlo; el efecto
 * se re-ejecuta cuando cambian `deps` (o tras `refetch()`). Recibe un
 * `AbortSignal` que se aborta al desmontar o al iniciar otra corrida: los
 * fetchers que lo soporten pueden cancelar la petición (los que lo ignoren
 * siguen funcionando igual).
 *
 * Cada corrida tiene un **generation id**: una respuesta vieja que llega tarde
 * (p. ej. un refetch lento seguido de otro rápido) no pisa `data`/`error` de la
 * corrida vigente. El `mounted` ref sigue evitando actualizar tras el desmontaje.
 */
export interface UseApiQueryResult<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: ApiError | null;
  readonly refetch: () => void;
}

export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

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
    const runId = ++runIdRef.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetcherRef.current(controller.signal).then(
      (value) => {
        if (!mountedRef.current || runId !== runIdRef.current) {
          return;
        }
        setData(value);
        setLoading(false);
      },
      (cause: unknown) => {
        // Una corrida abortada o superada por otra no debe pisar el estado.
        if (!mountedRef.current || runId !== runIdRef.current || controller.signal.aborted) {
          return;
        }
        setError(toApiError(cause));
        setLoading(false);
      },
    );

    return () => {
      controller.abort();
    };
  }, [reloadKey, ...deps]);

  const refetch = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return { data, loading, error, refetch };
}
