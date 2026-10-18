'use client';

import { RequireRole } from '@/components/guards';
import { ArrivalForm } from '@/components/production/arrival-form';

/**
 * Ruta `/suministros/arribo` (pantalla 12): admin y worker registran arribos;
 * el worker entra en modo manual (los catálogos son A/Au).
 */
export default function ArriboPage() {
  return (
    <RequireRole roles={['admin', 'worker']}>
      <ArrivalForm />
    </RequireRole>
  );
}
