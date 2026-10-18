'use client';

import { RequireRole } from '@/components/guards';
import { ProductionsScreen } from '@/components/production/productions-screen';

/**
 * Ruta `/produccion` (pantalla 9): producciones activas (A/W/Au) con buscador
 * por ID. Las acciones por rol viven dentro de la pantalla.
 */
export default function ProduccionPage() {
  return (
    <RequireRole roles={['admin', 'worker', 'auditor']}>
      <ProductionsScreen />
    </RequireRole>
  );
}
