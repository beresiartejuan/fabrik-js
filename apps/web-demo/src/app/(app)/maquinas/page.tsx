'use client';

import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { MachinesScreen } from '@/components/catalogs/machines-screen';
import { RequireRole } from '@/components/guards';

/**
 * Ruta `/maquinas` (pantalla 5). `RequireRole` restringe a admin/auditor y
 * `CatalogGate` decide la escritura (admin).
 */
export default function MaquinasPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <CatalogGate>{(canWrite) => <MachinesScreen canWrite={canWrite} />}</CatalogGate>
    </RequireRole>
  );
}
