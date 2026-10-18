'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageLoading } from '@/components/page-loading';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { errorToMessage } from '@/lib/api/errors';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { productionApi } from '@/lib/api/modules/productionApi';
import { recipesApi } from '@/lib/api/modules/recipesApi';
import { batchLabel } from '@/lib/format/ids';
import { formatQuantity } from '@/lib/format/quantity';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

/**
 * Pantalla 10 — `/produccion/nueva` (solo admin). Elige una receta con vista
 * previa de sus pasos → `POST /production/start { recipeId }` → redirige a
 * `/produccion`, donde lista el lote raíz `in_progress` creado.
 */
export function NewProductionForm() {
  const router = useRouter();
  const recipes = useApiQuery(() => recipesApi.list());
  const materials = useApiQuery(() => materialsApi.list());
  useErrorToast(recipes.error);
  useErrorToast(materials.error);

  const [recipeId, setRecipeId] = useState('');
  const [busy, setBusy] = useState(false);

  const materialById = useMemo(
    () => new Map((materials.data ?? []).map((material) => [material.id, material])),
    [materials.data],
  );
  const selected = (recipes.data ?? []).find((recipe) => recipe.id === recipeId) ?? null;

  function productName(materialId: string): string {
    return materialById.get(materialId)?.name ?? materialId;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      const batch = await productionApi.start({ recipeId });
      toast.success(`Producción iniciada · ${batchLabel(batch.id)}.`);
      router.push('/produccion');
    } catch (error) {
      toast.error(errorToMessage(error));
      setBusy(false);
    }
  }

  if (recipes.loading || materials.loading) {
    return <PageLoading label="Cargando recetas…" />;
  }

  if (recipes.error) {
    return <QueryError error={recipes.error} onRetry={recipes.refetch} />;
  }
  if (materials.error) {
    return <QueryError error={materials.error} onRetry={materials.refetch} />;
  }

  if ((recipes.data ?? []).length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Nueva producción" description="Iniciar una orden desde una receta." />
        <EmptyState
          title="Todavía no hay recetas"
          description="Creá la primera receta para poder iniciar una producción."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nueva producción"
        description="Iniciar una orden de producción: el lote raíz queda en curso hasta completarla."
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <SelectField
          label="Receta"
          value={recipeId}
          onValueChange={setRecipeId}
          options={(recipes.data ?? []).map((recipe) => ({
            value: recipe.id,
            label: recipe.name,
          }))}
          placeholder="Elegí una receta"
          disabled={busy}
        />

        {selected && (
          <section className="flex flex-col gap-2 rounded-xl border bg-background p-4">
            <h2 className="font-heading text-base font-medium">Vista previa</h2>
            <p className="text-sm">
              <span className="text-muted-foreground">Producto final:</span>{' '}
              {productName(selected.outputProductId)} · {formatQuantity(selected.outputQuantity)}
            </p>
            <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
              {selected.steps.map((step) => (
                <li key={step.id}>
                  Paso {step.position} · <span className="capitalize">{step.machineType}</span> ·{' '}
                  {step.inputs.length} {step.inputs.length === 1 ? 'insumo' : 'insumos'} →{' '}
                  {productName(step.outputProductId)} {formatQuantity(step.outputQuantity)}
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !selected}>
            {busy ? 'Iniciando…' : 'Iniciar producción'}
          </Button>
        </div>
      </form>
    </div>
  );
}
