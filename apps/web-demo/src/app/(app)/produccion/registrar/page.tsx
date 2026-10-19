'use client';

import { RequireRole } from '@/components/guards';
import { RegistrarForm } from '@/components/production/registrar-form';

/**
 * Ruta `/produccion/registrar` (pantalla 11): solo operario. El dominio exige
 * `RecordTransformation` con rol `worker` (un admin recibiría 403 al enviar).
 */
export default function RegistrarTransformacionPage() {
  return (
    <RequireRole roles={['worker']}>
      <RegistrarForm />
    </RequireRole>
  );
}
