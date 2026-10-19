'use client';

import { RequireRole } from '@/components/guards';
import { NewProductionForm } from '@/components/production/new-production-form';

/** Ruta `/produccion/nueva` (pantalla 10): solo admin inicia órdenes. */
export default function NuevaProduccionPage() {
  return (
    <RequireRole roles={['admin']}>
      <NewProductionForm />
    </RequireRole>
  );
}
