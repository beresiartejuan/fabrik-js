'use client';

import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { MaterialsScreen } from '@/components/catalogs/materials-screen';
import { RequireRole } from '@/components/guards';

/**
 * Ruta `/materiales` (pantalla 3). `RequireRole` restringe a admin/auditor y
 * `CatalogGate` decide la escritura (admin).
 */
export default function MaterialesPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <CatalogGate>{(canWrite) => <MaterialsScreen canWrite={canWrite} />}</CatalogGate>
    </RequireRole>
  );
}
