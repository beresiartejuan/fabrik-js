'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { errorToMessage } from '@/lib/api/errors';

/**
 * Dispara un toast en español cuando cambia el error de un `useApiQuery`
 * (docs/pantallas.md §Pantallas 3–6). Centraliza el mapeo `errorToMessage`
 * + `sonner` para no repetirlo en cada pantalla.
 */
export function useErrorToast(error: unknown): void {
  useEffect(() => {
    if (error) {
      toast.error(errorToMessage(error));
    }
  }, [error]);
}
