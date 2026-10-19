'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { CatalogGate } from '@/components/catalogs/catalog-gate';
import { RequireRole } from '@/components/guards';
import { PageLoading } from '@/components/page-loading';
import { RecipeEditorScreen } from '@/components/recipes/recipe-editor-screen';

/**
 * Ruta `/recetas/detalle?id=<id>` (pantalla 7, variante para el **export
 * estático**): las rutas dinámicas `[id]` no existen en `output: 'export'`, así
 * que el id llega por query param — el mismo patrón `useSearchParams` +
 * `Suspense` del deep-link `?batch=` de `/trazabilidad`. `?id=` vacío o
 * ausente cae en modo alta (como `/recetas/nueva`). El auditor entra en modo
 * solo lectura.
 */
export default function EditarRecetaPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <Suspense fallback={<PageLoading label="Cargando receta…" />}>
        <RecetaContent />
      </Suspense>
    </RequireRole>
  );
}

function RecetaContent() {
  const searchParams = useSearchParams();
  const recipeId = searchParams.get('id') || undefined;
  return (
    <CatalogGate>
      {(canWrite) => <RecipeEditorScreen recipeId={recipeId} canWrite={canWrite} />}
    </CatalogGate>
  );
}
