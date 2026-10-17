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
});
