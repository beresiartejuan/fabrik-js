'use client';

import type { UnitOfMeasure } from '@fabrik/domain';
import { MAX_OBSERVATION_LENGTH } from '@fabrik/domain';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CatalogsReadGate } from '@/components/shared/catalogs-read-gate';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { SelectField } from '@/components/shared/select-field';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorToMessage } from '@/lib/api/errors';
import { batchesApi } from '@/lib/api/modules/batchesApi';
import { locationsApi } from '@/lib/api/modules/locationsApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { meApi } from '@/lib/api/modules/meApi';
import { productionApi, type RecordTransformationInput } from '@/lib/api/modules/productionApi';
import { recipesApi } from '@/lib/api/modules/recipesApi';
import type { BatchEventWire, BatchWire, RecipeWire } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format/date';
import { batchLabel, shortId } from '@/lib/format/ids';
import { BATCH_STATUS_LABELS, BATCH_STATUS_META } from '@/lib/format/labels';
import { formatQuantity } from '@/lib/format/quantity';
import { UNIT_LABELS, unitLabel } from '@/lib/format/units';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

import {
  activeMachinesFromSchedule,
  addInput,
  addOutput,
  consumableBatches,
  createEmptyRegistrarForm,
  observationCount,
  type RegistrarFormState,
  recipeIdFromInputs,
  removeInput,
  removeOutput,
  resetKeepingMachine,
  setInputAmount,
  setInputBatch,
  setMachine,
  setObservation,
  setOutputAmount,
  setOutputMaterial,
  setOutputMaterialId,
  setOutputUnit,
  setRecipeStep,
  stepsForMachine,
  toTransformPayload,
  validateRegistrarForm,
} from './registrar-state';

/** Datos del panel de seguimiento tras un 201 de `transform`. */
interface TransformationResult {
  readonly event: BatchEventWire;
  readonly batches: readonly BatchWire[];
  /** Lote raíz de la orden (trae `recipeId`) o `null` si no se conocía. */
  readonly root: BatchWire | null;
}

/**
 * Pantalla 11 — `/produccion/registrar` (roles A/W en la API, worker en la UI).
 *
 * - **Máquina:** desde `GET /me/schedule`, solo las con `activeNow` (calculado
 *   en el servidor) y `status !== 'maintenance'`; el aviso de falta es explícito.
 * - **Insumos:** filas `{ batchId, quantity }` con picker desde `GET /batches`
 *   (el helper de "lotes recientes" vía `/batch-events` es A/Au y el operario no
 *   puede leerlo). La unidad se deriva del lote; los `completed` no se ofrecen.
 * - **Paso de receta (opcional):** derivado de la receta del primer input con
 *   `recipeId`, filtrada por el tipo de la máquina. Si la receta no es legible
 *   (worker → 403) la transformación queda ad-hoc, que el dominio permite.
 * - **Salidas:** filas `{ materialId, quantity }` con unidad derivada del
 *   material (modo catálogo) o manual (worker, sin catálogo; la API revalida I6).
 * - **Observación:** textarea con contador, máx. 500 (`MAX_OBSERVATION_LENGTH`).
 * - **Envío:** `POST /production/transform` **sin** `workerId` ni `timestamp`
 *   en el body. Tras el 201 muestra los lotes de output + «Almacenar»
 *   (`POST /production/store`, lugar de almacén) y «Completar producción»
 *   (`POST /production/complete` sobre la orden raíz).
 */
export function RegistrarForm() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Registrar transformación"
        description="Consumí lotes en una máquina asignada a vos y declará las salidas; la API valida horario, paso y unidades."
      />
      <CatalogsReadGate>
        {(canReadCatalogs) => <RegistrarFormBody canReadCatalogs={canReadCatalogs} />}
      </CatalogsReadGate>
    </div>
  );
}

interface RegistrarFormBodyProps {
  readonly canReadCatalogs: boolean;
}

function RegistrarFormBody({ canReadCatalogs }: RegistrarFormBodyProps) {
  const schedule = useApiQuery(() => meApi.schedule());
  const batches = useApiQuery(() => batchesApi.list());
  const materials = useApiQuery(
    () => (canReadCatalogs ? materialsApi.list() : Promise.resolve(null)),
    [canReadCatalogs],
  );
  useErrorToast(schedule.error);
  useErrorToast(batches.error);
  useErrorToast(materials.error);

  const [form, setForm] = useState<RegistrarFormState>(createEmptyRegistrarForm);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [result, setResult] = useState<TransformationResult | null>(null);

  // Diálogo de almacenamiento del lote de output.
  const [storingBatch, setStoringBatch] = useState<BatchWire | null>(null);
  const [storeLocationId, setStoreLocationId] = useState('');
  const [storeIssues, setStoreIssues] = useState<string[]>([]);
  const [storeBusy, setStoreBusy] = useState(false);
  const observationId = useId();
  const manualStoreLocationId = useId();

  // Confirmación de completar la orden de producción (lote raíz).
  const [orderToComplete, setOrderToComplete] = useState<BatchWire | null>(null);

  const machines = useMemo(() => activeMachinesFromSchedule(schedule.data ?? []), [schedule.data]);
  const batchesById = useMemo(
    () => new Map((batches.data ?? []).map((batch) => [batch.id, batch])),
    [batches.data],
  );
  const inputBatches = useMemo(() => consumableBatches(batches.data ?? []), [batches.data]);
  const materialById = useMemo(
    () => new Map((materials.data ?? []).map((material) => [material.id, material])),
    [materials.data],
  );

  const selectedMachine = machines.find((machine) => machine.id === form.machineId) ?? null;

  // Contexto de receta: la del primer input que la declare. Si la receta no es
  // legible para el rol (worker → 403), el catch degrada a transformación
  // ad-hoc (permitida por el dominio) sin bloquear el formulario.
  const contextRecipeId = useMemo(() => recipeIdFromInputs(form, batchesById), [form, batchesById]);
  const recipe = useApiQuery(
    () =>
      contextRecipeId ? recipesApi.get(contextRecipeId).catch(() => null) : Promise.resolve(null),
    [contextRecipeId],
  );
  const recipeSteps = useMemo(
    () => stepsForMachine(recipe.data, selectedMachine?.type),
    [recipe.data, selectedMachine?.type],
  );

  const productOptions = (materials.data ?? [])
    .filter((material) => material.kind === 'product')
    .map((material) => ({
      value: material.id,
      label: material.active ? material.name : `${material.name} (inactivo)`,
    }));
  const inputOptions = inputBatches.map((batch) => ({
    value: batch.id,
    label: `${batchLabel(batch.id)} · mat ${shortId(batch.materialId)} · ${formatQuantity(batch.quantity)} · ${BATCH_STATUS_LABELS[batch.status]}`,
  }));

  function mutate(updater: (current: RegistrarFormState) => RegistrarFormState): void {
    setForm((current) => updater(current));
    setIssues([]);
  }

  /** El lote que aportó el contexto de receta es la orden raíz (con `recipeId`). */
  function rootBatchFor(state: RegistrarFormState): BatchWire | null {
    const contextId = recipeIdFromInputs(state, batchesById);
    if (!contextId) {
      return null;
    }
    for (const row of state.inputs) {
      const batch = batchesById.get(row.batchId);
      if (batch?.recipeId === contextId) {
        return batch;
      }
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const draft = validateRegistrarForm(form);
    setIssues([...draft.issues]);
    if (!draft.valid) {
      return;
    }
    const payload: RecordTransformationInput = toTransformPayload(form);
    setBusy(true);
    try {
      const transformation = await productionApi.transform(payload);
      toast.success('Se registró la transformación.');
      setResult({
        event: transformation.event,
        batches: [...transformation.outputBatches],
        root: rootBatchFor(form),
      });
      // Limpia el formulario conservando la máquina (flujo de pasos continuos).
      setForm(resetKeepingMachine(form));
      // Los lotes nuevos quedan disponibles como inputs del siguiente paso.
      batches.refetch();
    } catch (error) {
      toast.error(errorToMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openStoreDialog(batch: BatchWire): void {
    setStoringBatch(batch);
    setStoreLocationId('');
    setStoreIssues([]);
  }

  async function confirmStore(): Promise<void> {
    if (!storingBatch) {
      return;
    }
    if (storeLocationId.trim().length === 0) {
      setStoreIssues(['Ingresá el lugar de almacenamiento.']);
      return;
    }
    setStoreBusy(true);
    try {
      const stored = await productionApi.store({
        batchId: storingBatch.id,
        locationId: storeLocationId.trim(),
      });
      toast.success(`Lote ${batchLabel(stored.id)} almacenado.`);
      setResult((current) =>
        current
          ? {
              ...current,
              batches: current.batches.map((batch) => (batch.id === stored.id ? stored : batch)),
            }
          : current,
      );
      batches.refetch();
      setStoringBatch(null);
    } catch (error) {
      toast.error(errorToMessage(error));
    } finally {
      setStoreBusy(false);
    }
  }

  async function confirmComplete(): Promise<void> {
    if (!orderToComplete) {
      return;
    }
    try {
      const completed = await productionApi.complete({ batchId: orderToComplete.id });
      toast.success('Producción completada.');
      setResult((current) => (current ? { ...current, root: completed ?? null } : current));
      batches.refetch();
      setOrderToComplete(null);
    } catch (error) {
      // Toast; re-lanza para que el ConfirmDialog quede abierto (cierra solo si
      // la promesa resuelve).
      toast.error(errorToMessage(error));
      throw error;
    }
  }

  if (schedule.error) {
    return <QueryError error={schedule.error} onRetry={schedule.refetch} />;
  }
  if (batches.error) {
    return <QueryError error={batches.error} onRetry={batches.refetch} />;
  }
  if (materials.error) {
    return <QueryError error={materials.error} onRetry={materials.refetch} />;
  }
  if (schedule.loading || batches.loading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (machines.length === 0) {
    return (
      <EmptyState
        title="No tenés máquinas activas para operar en este momento"
        description="Tus franjas no están vigentes o las máquinas están en mantenimiento. Volvé a consultar más tarde."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!canReadCatalogs && (
        <p
          role="note"
          className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          Tu rol no puede leer el catálogo de materiales: las salidas se cargan con el ID del
          material y la unidad la valida el servidor (I6).
        </p>
      )}

      {result && (
        <TransformationResultCard
          result={result}
          materialName={(materialId) => materialById.get(materialId)?.name ?? materialId}
          onClose={() => setResult(null)}
          onStore={openStoreDialog}
          onComplete={(root) => setOrderToComplete(root)}
        />
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {issues.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <ul className="list-inside list-disc space-y-1">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <SelectField
          label="Máquina (asignada ahora)"
          value={form.machineId}
          onValueChange={(value) => mutate((current) => setMachine(current, value))}
          options={machines.map((machine) => ({
            value: machine.id,
            label: `${machine.name} (${machine.type})`,
          }))}
          placeholder="Elegí una máquina"
          disabled={busy}
        />

        <RecipeStepField
          selectedStepId={form.recipeStepId}
          recipe={recipe.data}
          steps={recipeSteps}
          recipeLoading={recipe.loading}
          hasContext={contextRecipeId !== null}
          disabled={busy}
          onChange={(value) => mutate((current) => setRecipeStep(current, value))}
        />

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Insumos</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => mutate((current) => addInput(current))}
            >
              <PlusIcon aria-hidden="true" />
              Agregar insumo
            </Button>
          </div>
          {form.inputs.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Sin insumos: la transformación debe declarar al menos un input o una salida.
            </p>
          )}
          {form.inputs.map((row, index) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
            >
              <SelectField
                label={`Insumo ${index + 1} · Lote`}
                value={row.batchId}
                onValueChange={(value) =>
                  mutate((current) => setInputBatch(current, row.key, batchesById.get(value)))
                }
                options={inputOptions}
                placeholder="Elegí un lote"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground sm:pt-6 sm:text-sm">
                {row.batchId ? `Unidad: ${unitLabel(row.unit)}` : 'La unidad sale del lote.'}
              </p>
              <Field>
                <FieldLabel>{`Insumo ${index + 1} · Cantidad`}</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(event) =>
                    mutate((current) => setInputAmount(current, row.key, event.target.value))
                  }
                  disabled={busy}
                  aria-label={`Insumo ${index + 1} · Cantidad`}
                />
                <FieldError>
                  {issues.find(
                    (issue) => issue === `Ingresá una cantidad válida para el insumo ${index + 1}.`,
                  )}
                </FieldError>
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar insumo ${index + 1}`}
                disabled={busy}
                onClick={() => mutate((current) => removeInput(current, row.key))}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Salidas</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => mutate((current) => addOutput(current))}
            >
              <PlusIcon aria-hidden="true" />
              Agregar salida
            </Button>
          </div>
          {form.outputs.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Sin salidas: la transformación debe declarar al menos un input o una salida.
            </p>
          )}
          {form.outputs.map((row, index) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
            >
              {canReadCatalogs ? (
                <SelectField
                  label={`Salida ${index + 1} · Material`}
                  value={row.materialId}
                  onValueChange={(value) =>
                    mutate((current) =>
                      setOutputMaterial(current, row.key, materialById.get(value)),
                    )
                  }
                  options={productOptions}
                  placeholder="Elegí un producto"
                  disabled={busy}
                />
              ) : (
                <Field>
                  <FieldLabel>{`Salida ${index + 1} · ID del material`}</FieldLabel>
                  <Input
                    value={row.materialId}
                    onChange={(event) =>
                      mutate((current) => setOutputMaterialId(current, row.key, event.target.value))
                    }
                    disabled={busy}
                    aria-label={`Salida ${index + 1} · ID del material`}
                  />
                  <FieldError>
                    {issues.find(
                      (issue) => issue === `Completá el material de la salida ${index + 1}.`,
                    )}
                  </FieldError>
                </Field>
              )}
              {canReadCatalogs ? (
                <p className="text-xs text-muted-foreground sm:pt-6 sm:text-sm">
                  {row.materialId
                    ? `Unidad: ${unitLabel(row.unit)}`
                    : 'La unidad sale del material.'}
                </p>
              ) : (
                <SelectField
                  label={`Salida ${index + 1} · Unidad`}
                  value={row.unit}
                  onValueChange={(value) =>
                    mutate((current) => setOutputUnit(current, row.key, value as UnitOfMeasure))
                  }
                  options={(Object.keys(UNIT_LABELS) as UnitOfMeasure[]).map((unit) => ({
                    value: unit,
                    label: UNIT_LABELS[unit],
                  }))}
                  placeholder="Unidad"
                  disabled={busy}
                />
              )}
              <Field>
                <FieldLabel>{`Salida ${index + 1} · Cantidad`}</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(event) =>
                    mutate((current) => setOutputAmount(current, row.key, event.target.value))
                  }
                  disabled={busy}
                  aria-label={`Salida ${index + 1} · Cantidad`}
                />
                <FieldError>
                  {issues.find(
                    (issue) => issue === `Ingresá una cantidad válida para la salida ${index + 1}.`,
                  )}
                </FieldError>
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar salida ${index + 1}`}
                disabled={busy}
                onClick={() => mutate((current) => removeOutput(current, row.key))}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>
          ))}
        </section>

        <Field>
          <FieldLabel htmlFor={observationId}>Observación (opcional)</FieldLabel>
          <Textarea
            id={observationId}
            value={form.observation}
            onChange={(event) =>
              mutate((current) =>
                setObservation(current, event.target.value.slice(0, MAX_OBSERVATION_LENGTH)),
              )
            }
            maxLength={MAX_OBSERVATION_LENGTH}
            disabled={busy}
          />
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {observationCount(form.observation)}
          </p>
        </Field>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar transformación'}
          </Button>
        </div>
      </form>

      <FormDialog
        open={storingBatch !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStoringBatch(null);
          }
        }}
        title={`Almacenar lote ${storingBatch ? batchLabel(storingBatch.id) : ''}`}
        description="El lote pasa a «Almacenado» y genera el movimiento de stock en el lugar elegido."
      >
        <div className="flex flex-col gap-3 py-2">
          {canReadCatalogs ? (
            <StorageLocationsField
              value={storeLocationId}
              disabled={storeBusy}
              onChange={(value) => {
                setStoreLocationId(value);
                setStoreIssues([]);
              }}
            />
          ) : (
            <Field>
              <FieldLabel htmlFor={manualStoreLocationId}>
                ID del lugar de almacenamiento
              </FieldLabel>
              <Input
                id={manualStoreLocationId}
                value={storeLocationId}
                onChange={(event) => {
                  setStoreLocationId(event.target.value);
                  setStoreIssues([]);
                }}
                disabled={storeBusy}
              />
              <p className="text-xs text-muted-foreground">
                Tu rol no puede listar los lugares: ingresá el ID y el servidor valida que sea
                almacén.
              </p>
            </Field>
          )}
          {storeIssues.map((issue) => (
            <FieldError key={issue}>{issue}</FieldError>
          ))}
        </div>
        <Button type="button" disabled={storeBusy} onClick={() => void confirmStore()}>
          {storeBusy ? 'Almacenando…' : 'Almacenar lote'}
        </Button>
      </FormDialog>

      <ConfirmDialog
        open={orderToComplete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOrderToComplete(null);
          }
        }}
        title="Completar producción"
        description={
          orderToComplete
            ? `Se cerrará la orden de producción (lote ${batchLabel(orderToComplete.id)}). La acción es definitiva.`
            : undefined
        }
        confirmLabel="Completar producción"
        onConfirm={() => confirmComplete()}
      />
    </div>
  );
}

// --- Piezas presentacionales -------------------------------------------------

/** Paso de receta opcional; visible solo si la receta está legible. */
function RecipeStepField({
  selectedStepId,
  recipe,
  steps,
  recipeLoading,
  hasContext,
  disabled,
  onChange,
}: {
  readonly selectedStepId: string;
  readonly recipe: RecipeWire | null;
  readonly steps: RecipeWire['steps'];
  readonly recipeLoading: boolean;
  readonly hasContext: boolean;
  readonly disabled: boolean;
  readonly onChange: (recipeStepId: string) => void;
}) {
  if (!hasContext) {
    return (
      <p className="text-xs text-muted-foreground">
        Sin paso de receta: elegí un insumo con receta para derivar los pasos compatibles.
      </p>
    );
  }
  if (recipeLoading) {
    return <p className="text-xs text-muted-foreground">Cargando pasos de la receta…</p>;
  }
  if (recipe === null) {
    return (
      <p className="text-xs text-muted-foreground">
        La receta no está disponible para tu rol: la transformación quedará ad-hoc (sin paso).
      </p>
    );
  }
  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Esta receta no tiene pasos para el tipo de la máquina elegida; la transformación quedará
        ad-hoc.
      </p>
    );
  }
  return (
    <SelectField
      label="Paso de receta (opcional)"
      value={selectedStepId}
      onValueChange={(value) => onChange(value === 'adhoc' ? '' : value)}
      options={[
        { value: 'adhoc', label: 'Ad-hoc (sin paso)' },
        ...steps.map((step) => ({
          value: step.id,
          label: `Paso ${step.position} · ${step.machineType}`,
        })),
      ]}
      placeholder="Transformación ad-hoc"
      disabled={disabled}
    />
  );
}

/** Lugares de almacenamiento para el diálogo de store (solo roles con catálogo). */
function StorageLocationsField({
  value,
  disabled,
  onChange,
}: {
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  const locations = useApiQuery(() => locationsApi.list({ kind: 'storage' }));
  useErrorToast(locations.error);
  return (
    <SelectField
      label="Lugar de almacenamiento"
      value={value}
      onValueChange={onChange}
      options={(locations.data ?? []).map((location) => ({
        value: location.id,
        label: location.name,
      }))}
      placeholder={locations.loading ? 'Cargando lugares…' : 'Elegí un almacén'}
      disabled={disabled || locations.loading}
    />
  );
}

/** Panel de resultado del `transform` con los seguimientos store/complete. */
function TransformationResultCard({
  result,
  materialName,
  onClose,
  onStore,
  onComplete,
}: {
  readonly result: TransformationResult;
  readonly materialName: (materialId: string) => string;
  readonly onClose: () => void;
  readonly onStore: (batch: BatchWire) => void;
  readonly onComplete: (root: BatchWire) => void;
}) {
  return (
    <section
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-medium">
          Transformación registrada · evento {shortId(result.event.id)}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">{formatDateTime(result.event.timestamp)}</p>

      <ul className="flex flex-col gap-2">
        {result.batches.map((batch) => (
          <li
            key={batch.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 text-sm"
          >
            <StatusBadge tone={BATCH_STATUS_META[batch.status].tone}>
              {BATCH_STATUS_META[batch.status].label}
            </StatusBadge>
            <span title={batch.id} className="font-mono">
              {batchLabel(batch.id)}
            </span>
            <span>{materialName(batch.materialId)}</span>
            <span>{formatQuantity(batch.quantity)}</span>
            {batch.status === 'in_progress' && (
              <Button variant="outline" size="sm" onClick={() => onStore(batch)}>
                Almacenar lote
              </Button>
            )}
          </li>
        ))}
      </ul>

      {result.root && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 text-sm">
          <StatusBadge tone={BATCH_STATUS_META[result.root.status].tone}>
            {BATCH_STATUS_META[result.root.status].label}
          </StatusBadge>
          <span>
            Orden de producción: <span title={result.root.id}>{batchLabel(result.root.id)}</span>
          </span>
          {(result.root.status === 'in_progress' || result.root.status === 'stored') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const root = result.root;
                if (root) {
                  onComplete(root);
                }
              }}
            >
              Completar producción
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
