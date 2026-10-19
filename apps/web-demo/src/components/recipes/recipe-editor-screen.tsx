'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageLoading } from '@/components/page-loading';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { type ApiError, errorToMessage, toApiError } from '@/lib/api/errors';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { type CreateRecipeInput, recipesApi } from '@/lib/api/modules/recipesApi';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

import { RecipeBuilder } from './recipe-builder';
import {
  builderStateFromRecipe,
  createEmptyBuilderState,
  type RecipeBuilderState,
} from './recipe-builder-state';

/**
 * Pantalla de alta/edición de recetas (`/recetas/nueva`, `/recetas/[id]`).
 *
 * Carga materiales (para los selects), máquinas (para el `datalist` de tipos) y,
 * en edición, la receta. El builder es el mismo en ambos modos; el auditor lo ve
 * en **solo lectura**. Al guardar, `PATCH /recipes/:id` reemplaza los pasos.
 */

export interface RecipeEditorScreenProps {
  /** `undefined` en `/recetas/nueva`. */
  readonly recipeId?: string;
  readonly canWrite: boolean;
}

export function RecipeEditorScreen({ recipeId, canWrite }: RecipeEditorScreenProps) {
  const router = useRouter();
  const materials = useApiQuery(() => materialsApi.list());
  const machines = useApiQuery(() => machinesApi.list());
  const recipe = useApiQuery(
    () => (recipeId ? recipesApi.get(recipeId) : Promise.resolve(null)),
    [recipeId],
  );
  useErrorToast(materials.error);
  useErrorToast(machines.error);
  useErrorToast(recipe.error);

  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<ApiError | null>(null);

  const machineTypes = useMemo(() => {
    const types = new Set((machines.data ?? []).map((machine) => machine.type));
    for (const step of recipe.data?.steps ?? []) {
      types.add(step.machineType);
    }
    return [...types].sort((a, b) => a.localeCompare(b, 'es'));
  }, [machines.data, recipe.data]);

  const loading = materials.loading || (recipeId !== undefined && recipe.loading);

  async function handleSubmit(payload: CreateRecipeInput): Promise<void> {
    setBusy(true);
    setServerError(null);
    try {
      if (recipeId) {
        await recipesApi.update(recipeId, payload);
        toast.success(`Se actualizó «${payload.name}».`);
      } else {
        await recipesApi.create(payload);
        toast.success(`Se creó «${payload.name}».`);
      }
      router.push('/recetas');
    } catch (error) {
      // El 422 de `RecipeIntegrityError` y el resto se muestran mapeados; los
      // `context` (p. ej. `reason`) quedan visibles en el builder.
      setServerError(toApiError(error));
      toast.error(errorToMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PageLoading label="Cargando receta…" />;
  }

  if (materials.error) {
    return <QueryError error={materials.error} onRetry={materials.refetch} />;
  }

  if (recipeId !== undefined && recipe.error) {
    return <QueryError error={recipe.error} onRetry={recipe.refetch} />;
  }

  if (recipeId !== undefined && !recipe.data) {
    return <QueryError error={toApiError(new Error('No se encontró la receta.'))} />;
  }

  let initialState: RecipeBuilderState;
  if (recipeId === undefined) {
    initialState = createEmptyBuilderState();
  } else {
    const data = recipe.data;
    if (!data) {
      return <PageLoading label="Cargando receta…" />;
    }
    initialState = builderStateFromRecipe(data);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={recipeId ? 'Editar receta' : 'Nueva receta'}
        description={
          recipeId
            ? 'Modificá la cabecera o los pasos. Al guardar se reemplaza la lista completa de pasos.'
            : 'Definí el producto de salida y la secuencia de transformaciones.'
        }
      />
      <RecipeBuilder
        key={recipeId ?? 'nueva'}
        mode={recipeId ? 'edit' : 'create'}
        initialState={initialState}
        materials={materials.data ?? []}
        machineTypes={machineTypes}
        busy={busy}
        readOnly={!canWrite}
        serverError={serverError}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/recetas')}
      />
    </div>
  );
}
