'use client';

import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { RequireRole } from '@/components/guards';
import { RecipesScreen } from '@/components/recipes/recipes-screen';

/**
 * Ruta `/recetas` (pantalla 7). Admin/auditor leen; `CatalogGate` decide la
 * escritura (solo admin).
 */
export default function RecetasPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <CatalogGate>{(canWrite) => <RecipesScreen canWrite={canWrite} />}</CatalogGate>
    </RequireRole>
  );
}
