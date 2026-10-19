'use client';

import type { UnitOfMeasure } from '@fabrik/domain';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { SelectField } from '@/components/shared/select-field';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorToMessage } from '@/lib/api/errors';
import { locationsApi } from '@/lib/api/modules/locationsApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { type SupplyArrivalInput, suppliesApi } from '@/lib/api/modules/suppliesApi';
import type { BatchWire } from '@/lib/api/types';
import { batchLabel } from '@/lib/format/ids';
import { BATCH_STATUS_META } from '@/lib/format/labels';
import { formatQuantity } from '@/lib/format/quantity';
import { UNIT_LABELS } from '@/lib/format/units';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

import { CatalogsReadGate } from '../shared/catalogs-read-gate';

/**
 * Pantalla 12 — `/suministros/arribo` (roles A/W).
 *
 * Material de tipo suministro + cantidad (unidad **derivada del material**, I6)
 * + lugar de tipo almacén → `POST /supplies/arrivals`; la respuesta 201 es el
 * lote `stored` creado. Éxito: toast con el id del lote + banner con
 * «Registrar otro» que limpia el formulario.
 *
 * **Degradación por rol:** `GET /materials|/locations` es A/Au (un operario
 * recibe 403 por `CATALOG_READ_ROLES`), así que el worker carga el arribo en
 * **modo manual** (ids + unidad a mano); la API valida la correspondencia exacta
 * igual (`422`). Es el hueco de API documentado en `docs/09-plan-de-api.md`.
 */
export function ArrivalForm() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Arribo de suministros"
        description="Ingresá al almacenamiento un material de tipo suministro; cada arribo crea un lote."
      />
      <CatalogsReadGate>
        {(canReadCatalogs) => <ArrivalFormBody canReadCatalogs={canReadCatalogs} />}
      </CatalogsReadGate>
    </div>
  );
}

interface ArrivalFormBodyProps {
  readonly canReadCatalogs: boolean;
}

function ArrivalFormBody({ canReadCatalogs }: ArrivalFormBodyProps) {
  const materials = useApiQuery(
    () => (canReadCatalogs ? materialsApi.list({ kind: 'supply' }) : Promise.resolve(null)),
    [canReadCatalogs],
  );
  const locations = useApiQuery(
    () => (canReadCatalogs ? locationsApi.list({ kind: 'storage' }) : Promise.resolve(null)),
    [canReadCatalogs],
  );
  useErrorToast(materials.error);
  useErrorToast(locations.error);

  const [materialId, setMaterialId] = useState('');
  const [manualUnit, setManualUnit] = useState('');
  const [amount, setAmount] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formIssues, setFormIssues] = useState<string[]>([]);
  const [lastArrival, setLastArrival] = useState<BatchWire | null>(null);
  const unitPreviewId = useId();
  const manualMaterialId = useId();
  const manualLocationId = useId();
  const amountId = useId();

  const materialById = useMemo(
    () => new Map((materials.data ?? []).map((material) => [material.id, material])),
    [materials.data],
  );
  const selectedMaterial = materialById.get(materialId);
  // En modo catálogo la unidad la impone el material (I6); en manual la elige el usuario.
  const unit = canReadCatalogs ? (selectedMaterial?.unitOfMeasure ?? '') : manualUnit;

  const materialOptions = (materials.data ?? []).map((material) => ({
    value: material.id,
    label: material.active ? material.name : `${material.name} (inactivo)`,
  }));

  function resetForm(): void {
    setMaterialId('');
    setManualUnit('');
    setAmount('');
    setLocationId('');
  }

  function resetAll(): void {
    resetForm();
    setFormIssues([]);
    setLastArrival(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const issues: string[] = [];
    if (materialId.length === 0) {
      issues.push('Elegí un material de tipo suministro.');
    }
    if (unit.length === 0) {
      issues.push('Ingresá la unidad del material.');
    }
    if (locationId.length === 0) {
      issues.push('Elegí un lugar de tipo almacén.');
    }
    if (amount.trim().length === 0 || Number(amount) <= 0 || !Number.isFinite(Number(amount))) {
      issues.push('Ingresá una cantidad mayor a cero.');
    }
    setFormIssues(issues);
    if (issues.length > 0) {
      return;
    }

    const payload: SupplyArrivalInput = {
      materialId,
      quantity: { amount: Number(amount), unit: unit as UnitOfMeasure },
      locationId,
    };
    setBusy(true);
    try {
      const batch = await suppliesApi.arrive(payload);
      toast.success(`Se registró el arribo · ${batchLabel(batch.id)}.`);
      setLastArrival(batch);
      resetForm();
    } catch (error) {
      toast.error(errorToMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!canReadCatalogs && (
        <p
          role="note"
          className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          Tu rol no puede leer los catálogos de materiales y lugares: ingresá los IDs y la unidad
          manualmente. El servidor valida la coincidencia de tipo y unidad.
        </p>
      )}

      {lastArrival && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm"
        >
          <StatusBadge tone={BATCH_STATUS_META.stored.tone}>
            {BATCH_STATUS_META.stored.label}
          </StatusBadge>
          <span>
            Último arribo: <strong>{batchLabel(lastArrival.id)}</strong> ·{' '}
            {formatQuantity(lastArrival.quantity)}
          </span>
          <Button variant="outline" size="sm" onClick={resetAll}>
            Registrar otro
          </Button>
        </div>
      )}

      {materials.error ? (
        <QueryError error={materials.error} onRetry={materials.refetch} />
      ) : locations.error ? (
        <QueryError error={locations.error} onRetry={locations.refetch} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {formIssues.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <ul className="list-inside list-disc space-y-1">
                {formIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {canReadCatalogs ? (
            <>
              <SelectField
                label="Material (suministro)"
                value={materialId}
                onValueChange={setMaterialId}
                options={materialOptions}
                placeholder={materials.loading ? 'Cargando materiales…' : 'Elegí un material'}
                disabled={materials.loading || busy}
              />
              <Field>
                <FieldLabel htmlFor={unitPreviewId}>Unidad (del material)</FieldLabel>
                <Input id={unitPreviewId} value={unit} readOnly />
                <p className="text-xs text-muted-foreground">
                  La unidad la determina el material elegido (I6).
                </p>
              </Field>
              <SelectField
                label="Lugar de almacenamiento"
                value={locationId}
                onValueChange={setLocationId}
                options={(locations.data ?? []).map((location) => ({
                  value: location.id,
                  label: location.name,
                }))}
                placeholder={locations.loading ? 'Cargando lugares…' : 'Elegí un almacén'}
                disabled={locations.loading || busy}
              />
            </>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={manualMaterialId}>ID del material (suministro)</FieldLabel>
                <Input
                  id={manualMaterialId}
                  value={materialId}
                  onChange={(event) => setMaterialId(event.target.value)}
                  disabled={busy}
                  placeholder="Id del material"
                />
              </Field>
              <SelectField
                label="Unidad"
                value={unit}
                onValueChange={setManualUnit}
                options={(Object.keys(UNIT_LABELS) as Array<keyof typeof UNIT_LABELS>).map(
                  (value) => ({ value, label: UNIT_LABELS[value] }),
                )}
                placeholder="Elegí la unidad"
                disabled={busy}
              />
              <Field>
                <FieldLabel htmlFor={manualLocationId}>ID del lugar de almacenamiento</FieldLabel>
                <Input
                  id={manualLocationId}
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                  disabled={busy}
                  placeholder="Id del lugar"
                />
              </Field>
            </>
          )}

          <Field>
            <FieldLabel htmlFor={amountId}>Cantidad</FieldLabel>
            <Input
              id={amountId}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
            />
            <FieldError>
              {formIssues.find((issue) => issue.startsWith('Ingresá una cantidad'))}
            </FieldError>
          </Field>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? 'Registrando…' : 'Registrar arribo'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
