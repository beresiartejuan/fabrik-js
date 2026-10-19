'use client';

import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { LocationsScreen } from '@/components/catalogs/locations-screen';
import { RequireRole } from '@/components/guards';

/**
 * Ruta `/ubicaciones` (pantalla 4). `RequireRole` restringe a admin/auditor y
 * `CatalogGate` decide la escritura (admin).
 */
export default function UbicacionesPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <CatalogGate>{(canWrite) => <LocationsScreen canWrite={canWrite} />}</CatalogGate>
    </RequireRole>
  );
}
