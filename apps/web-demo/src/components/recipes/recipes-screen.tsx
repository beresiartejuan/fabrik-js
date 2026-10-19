'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { RowActions } from '@/components/shared/row-actions';
import { Button } from '@/components/ui/button';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { recipesApi } from '@/lib/api/modules/recipesApi';
import type { RecipeWire } from '@/lib/api/types';
import { formatQuantity } from '@/lib/format/quantity';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

/**
 * Pantalla 7 — `/recetas` (lista). Muestra nombre, producto de salida resuelto
 * contra `GET /materials`, cantidad y cantidad de pasos. El admin puede crear o
 * editar; el auditor abre la receta en modo solo lectura.
 */

export function RecipesScreen({ canWrite }: { readonly canWrite: boolean }) {
  const router = useRouter();
  const recipes = useApiQuery(() => recipesApi.list());
  const materials = useApiQuery(() => materialsApi.list());
  useErrorToast(recipes.error);
  useErrorToast(materials.error);

  const materialById = useMemo(
    () => new Map((materials.data ?? []).map((material) => [material.id, material])),
    [materials.data],
  );

  function productName(recipe: RecipeWire): string {
    return materialById.get(recipe.outputProductId)?.name ?? recipe.outputProductId;
  }

  const columns: DataTableColumn<RecipeWire>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (recipe) => (
        <Link
          href={`/recetas/detalle?id=${recipe.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {recipe.name}
        </Link>
      ),
      sortValue: (recipe) => recipe.name,
    },
    {
      id: 'outputProduct',
      header: 'Producto de salida',
      cell: (recipe) => productName(recipe),
      sortValue: (recipe) => productName(recipe),
    },
    {
      id: 'outputQuantity',
      header: 'Cantidad',
      cell: (recipe) => formatQuantity(recipe.outputQuantity),
      sortValue: (recipe) => recipe.outputQuantity.amount,
    },
    {
      id: 'steps',
      header: 'Pasos',
      cell: (recipe) => recipe.steps.length,
      sortValue: (recipe) => recipe.steps.length,
    },
    {
      id: 'actions',
      header: 'Acciones',
      cellClassName: 'text-right',
      cell: (recipe) => (
        <RowActions
          actions={[
            {
              label: canWrite ? 'Editar' : 'Ver receta',
              onSelect: () => router.push(`/recetas/detalle?id=${recipe.id}`),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recetas"
        description="Secuencias de pasos para fabricar cada producto."
        actions={
          canWrite ? (
            <Button onClick={() => router.push('/recetas/nueva')}>
              <PlusIcon aria-hidden="true" />
              Nueva receta
            </Button>
          ) : undefined
        }
      />

      {recipes.error ? (
        <QueryError error={recipes.error} onRetry={recipes.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={recipes.data ?? []}
          getRowId={(recipe) => recipe.id}
          loading={recipes.loading}
          searchable
          searchPlaceholder="Buscar recetas…"
          searchValue={(recipe) => [recipe.name, productName(recipe)].join(' ')}
          emptyTitle="Todavía no hay recetas"
          emptyDescription="Creá la primera receta para poder iniciar una producción."
          emptyAction={
            canWrite ? (
              <Button variant="outline" onClick={() => router.push('/recetas/nueva')}>
                <PlusIcon aria-hidden="true" />
                Nueva receta
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
