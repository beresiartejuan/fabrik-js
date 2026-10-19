'use client';

import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { WorkersScreen } from '@/components/catalogs/workers-screen';
import { RequireRole } from '@/components/guards';

/**
 * Ruta `/trabajadores` (pantalla 6). `RequireRole` restringe a admin/auditor y
 * `CatalogGate` decide la escritura (admin).
 */
export default function TrabajadoresPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <CatalogGate>{(canWrite) => <WorkersScreen canWrite={canWrite} />}</CatalogGate>
    </RequireRole>
  );
}
