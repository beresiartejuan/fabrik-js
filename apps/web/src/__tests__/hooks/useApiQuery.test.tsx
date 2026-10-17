import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/errors';
import { useApiQuery } from '@/lib/hooks/useApiQuery';

describe('useApiQuery', () => {
  it('expone loading y luego data', async () => {
    const fetcher = vi.fn(async () => ({ id: 'm1' }));
    const { result } = renderHook(() => useApiQuery(fetcher));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ id: 'm1' });
    expect(result.current.error).toBeNull();
  });

  it('normaliza el error a ApiError', async () => {
    const cause = new ApiError({ statusCode: 404, error: 'NotFoundError', message: 'x' });
    const fetcher = vi.fn(async () => {
      throw cause;
    });
    const { result } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(cause);
    expect(result.current.data).toBeNull();
  });

  it('refetch vuelve a pedir los datos', async () => {
    const fetcher = vi.fn(async () => ({ n: 1 }));
    const { result } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('una respuesta vieja que llega tarde no pisa el resultado del refetch', async () => {
    const pending: Array<(value: { n: number }) => void> = [];
    const fetcher = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<{ n: number }>((resolve) => {
          pending.push(resolve);
        }),
    );
    const { result } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    // La segunda corrida (rápida) resuelve primero…
    await act(async () => {
      pending[1]({ n: 2 });
    });
    expect(result.current.data).toEqual({ n: 2 });

    // …y la primera (lenta) llega después: debe ignorarse.
    await act(async () => {
      pending[0]({ n: 1 });
    });
    expect(result.current.data).toEqual({ n: 2 });
    expect(result.current.loading).toBe(false);
  });

  it('aborta el fetcher al desmontar (cleanup)', async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn(
      (nextSignal: AbortSignal) =>
        new Promise<{ n: number }>(() => {
          signal = nextSignal;
        }),
    );
    const { unmount } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
