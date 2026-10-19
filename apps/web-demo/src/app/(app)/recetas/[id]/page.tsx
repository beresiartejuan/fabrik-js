'use client';

import { Suspense, use } from 'react';

import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { RequireRole } from '@/components/guards';
import { PageLoading } from '@/components/page-loading';
import { RecipeEditorScreen } from '@/components/recipes/recipe-editor-screen';

/**
 * Ruta `/recetas/[id]` (pantalla 7). En Next 16 `params` es una promesa: en un
 * Client Component se resuelve con `use()` dentro de un `Suspense` (cache
 * components). El auditor entra en modo solo lectura.
 */
export default function EditarRecetaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Cargando receta…" />}>
      <RecetaContent params={params} />
    </Suspense>
  );
}

function RecetaContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <CatalogGate>
        {(canWrite) => <RecipeEditorScreen recipeId={id} canWrite={canWrite} />}
      </CatalogGate>
    </RequireRole>
  );
}
