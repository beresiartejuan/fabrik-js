'use client';

import { AssignmentsScreen } from '@/components/assignments/assignments-screen';
import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { RequireRole } from '@/components/guards';

/**
 * Ruta `/asignaciones` (pantalla 8). Admin/auditor leen; `CatalogGate` decide
 * la escritura (solo admin asigna y desasigna).
 */
export default function AsignacionesPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <CatalogGate>{(canWrite) => <AssignmentsScreen canWrite={canWrite} />}</CatalogGate>
    </RequireRole>
  );
}
