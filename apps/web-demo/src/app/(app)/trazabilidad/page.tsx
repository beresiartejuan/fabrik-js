'use client';

import { Suspense } from 'react';

import { RequireRole } from '@/components/guards';
import { PageLoading } from '@/components/page-loading';
import { TraceScreen } from '@/components/trace/trace-screen';

/**
 * Ruta `/trazabilidad` (pantalla 14, Fase 6): genealogía hacia atrás y recall
 * (A/Au; ver `TraceScreen`). El `useSearchParams` del deep-link `?batch=` vive
 * dentro de un `Suspense` para permitir el prerender de la ruta.
 */
export default function TrazabilidadPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <Suspense fallback={<PageLoading label="Cargando trazabilidad…" />}>
        <TraceScreen />
      </Suspense>
    </RequireRole>
  );
}
