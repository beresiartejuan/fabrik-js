'use client';

import { type UnitOfMeasure, unitsForPhysicalState } from '@fabrik/domain';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';

import { QueryError } from '@/components/shared/query-error';
import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ApiError } from '@/lib/api/errors';
import type { CreateRecipeInput } from '@/lib/api/modules/recipesApi';
import type { MaterialWire } from '@/lib/api/types';
import { UNIT_LABELS, unitLabel } from '@/lib/format/units';

import {
  addInput,
  addStep,
  type BuilderInput,
  type BuilderQuantity,
  type BuilderStep,
  issueForPath,
  moveStep,
  type RecipeBuilderState,
  removeInput,
  removeStep,
  selectOutputProduct,
  selectStepOutputProduct,
  toRecipePayload,
  updateInput,
  updateRecipe,
  updateStep,
  validateRecipe,
} from './recipe-builder-state';

/**
 * Builder compartido de recetas (`/recetas/nueva` y `/recetas/[id]`).
 *
 * Cabecera (nombre + producto/cantidad de salida) y pasos ordenables con
 * insumos repetibles. El estado y las operaciones puras viven en
 * `recipe-builder-state.ts`; acá solo se renderiza y se conecta el submit.
 *
 * Los pasos se envían con `position` recalculada 1..N. En edición la API
 * **reemplaza la lista completa** (`PATCH`), no hace merge por posición.
 */

const ALL_UNITS = Object.keys(UNIT_LABELS) as UnitOfMeasure[];

export interface RecipeBuilderProps {
  readonly mode: 'create' | 'edit';
  readonly initialState: RecipeBuilderState;
  readonly materials: readonly MaterialWire[];
  readonly machineTypes: readonly string[];
  readonly busy?: boolean;
  readonly readOnly?: boolean;
  readonly serverError?: ApiError | null;
  readonly onSubmit: (payload: CreateRecipeInput) => void;
  readonly onCancel: () => void;
}

function materialOptions(
  materials: readonly MaterialWire[],
  kind?: MaterialWire['kind'],
): { value: string; label: string }[] {
  return materials
    .filter((material) => (kind ? material.kind === kind : true))
    .map((material) => ({
      value: material.id,
      label: material.active ? material.name : `${material.name} (inactivo)`,
    }));
}

function unitOptions(material: MaterialWire | undefined, current: UnitOfMeasure) {
  const units = material ? unitsForPhysicalState(material.physicalState) : ALL_UNITS;
  const available = units.includes(current) ? units : [...units, current];
  return available.map((unit) => ({ value: unit, label: unitLabel(unit) }));
}

function findMaterial(
  materials: readonly MaterialWire[],
  materialId: string,
): MaterialWire | undefined {
  return materials.find((material) => material.id === materialId);
}

function ServerErrorDetails({ error }: { readonly error: ApiError }) {
  const entries = Object.entries(error.context ?? {});
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground">
      <p className="mb-1 font-medium text-foreground">Detalle del servidor</p>
      <dl className="grid gap-1 sm:grid-cols-[auto_1fr]">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-medium">{key}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QuantityFields({
  amountLabel,
  unitLabelText,
  quantity,
  material,
  amountError,
  unitError,
  disabled,
  onAmountChange,
  onUnitChange,
}: {
  readonly amountLabel: string;
  readonly unitLabelText: string;
  readonly quantity: BuilderQuantity;
  readonly material: MaterialWire | undefined;
  readonly amountError?: string;
  readonly unitError?: string;
  readonly disabled: boolean;
  readonly onAmountChange: (amount: string) => void;
  readonly onUnitChange: (unit: UnitOfMeasure) => void;
}) {
  const amountId = useId();
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Field data-invalid={amountError !== undefined}>
        <FieldLabel htmlFor={amountId}>{amountLabel}</FieldLabel>
        <Input
          id={amountId}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={quantity.amount}
          onChange={(event) => onAmountChange(event.target.value)}
          disabled={disabled}
          aria-invalid={amountError !== undefined}
        />
        <FieldError>{amountError}</FieldError>
      </Field>
      <div className="flex flex-col gap-2">
        <SelectField
          label={unitLabelText}
          value={quantity.unit}
          onValueChange={(value) => onUnitChange(value as UnitOfMeasure)}
          options={unitOptions(material, quantity.unit)}
          disabled={disabled}
        />
        <FieldError>{unitError}</FieldError>
      </div>
    </div>
  );
}

function InputRow({
  step,
  input,
  inputIndex,
  materials,
  validationIssues,
  disabled,
  onChangeMaterial,
  onChangeAmount,
  onChangeUnit,
  onRemove,
}: {
  readonly step: BuilderStep;
  readonly input: BuilderInput;
  readonly inputIndex: number;
  readonly materials: readonly MaterialWire[];
  readonly validationIssues: Parameters<typeof issueForPath>[0];
  readonly disabled: boolean;
  readonly onChangeMaterial: (materialId: string) => void;
  readonly onChangeAmount: (amount: string) => void;
  readonly onChangeUnit: (unit: UnitOfMeasure) => void;
  readonly onRemove: () => void;
}) {
  const inputNumber = inputIndex + 1;
  const prefix = `Paso ${step.position} · Insumo ${inputNumber}`;
  const material = findMaterial(materials, input.materialId);

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] sm:items-start">
      <div className="flex flex-col gap-2">
        <SelectField
          label={`${prefix} · Material`}
          value={input.materialId}
          onValueChange={onChangeMaterial}
          options={materialOptions(materials)}
          placeholder="Elegí un material"
          disabled={disabled}
        />
        <FieldError>
          {issueForPath(
            validationIssues,
            `steps.${step.position}.inputs.${inputNumber}.materialId`,
          )}
        </FieldError>
      </div>
      <Field
        data-invalid={
          issueForPath(validationIssues, `steps.${step.position}.inputs.${inputNumber}.amount`) !==
          undefined
        }
      >
        <FieldLabel>{`${prefix} · Cantidad`}</FieldLabel>
        <Input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={input.quantity.amount}
          onChange={(event) => onChangeAmount(event.target.value)}
          disabled={disabled}
          aria-label={`${prefix} · Cantidad`}
          aria-invalid={
            issueForPath(
              validationIssues,
              `steps.${step.position}.inputs.${inputNumber}.amount`,
            ) !== undefined
          }
        />
        <FieldError>
          {issueForPath(validationIssues, `steps.${step.position}.inputs.${inputNumber}.amount`)}
        </FieldError>
      </Field>
      <div className="flex flex-col gap-2">
        <SelectField
          label={`${prefix} · Unidad`}
          value={input.quantity.unit}
          onValueChange={(value) => onChangeUnit(value as UnitOfMeasure)}
          options={unitOptions(material, input.quantity.unit)}
          disabled={disabled}
        />
        <FieldError>
          {issueForPath(validationIssues, `steps.${step.position}.inputs.${inputNumber}.unit`)}
        </FieldError>
      </div>
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Quitar insumo ${inputNumber} del paso ${step.position}`}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}

function StepCard({
  step,
  stepIndex,
  stepCount,
  materials,
  validationIssues,
  disabled,
  onChangeStep,
  onChangeInput,
  onChangeOutput,
  onRemoveInput,
  onAddInput,
  onMove,
  onRemove,
}: {
  readonly step: BuilderStep;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly materials: readonly MaterialWire[];
  readonly validationIssues: Parameters<typeof issueForPath>[0];
  readonly disabled: boolean;
  readonly onChangeStep: (updater: (step: BuilderStep) => BuilderStep) => void;
  readonly onChangeInput: (
    inputKey: string,
    updater: (input: BuilderInput) => BuilderInput,
  ) => void;
  readonly onChangeOutput: (material: MaterialWire | undefined) => void;
  readonly onRemoveInput: (inputKey: string) => void;
  readonly onAddInput: () => void;
  readonly onMove: (direction: 'up' | 'down') => void;
  readonly onRemove: () => void;
}) {
  const stepOutput = findMaterial(materials, step.outputProductId);
  const machineTypeId = useId();
  const machineTypeErrorId = useId();
  const machineTypeError = issueForPath(validationIssues, `steps.${step.position}.machineType`);
  const outputProductError = issueForPath(
    validationIssues,
    `steps.${step.position}.outputProductId`,
  );

  return (
    <article
      data-slot="recipe-step"
      data-position={step.position}
      className="flex flex-col gap-4 rounded-xl border bg-background p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-medium">Paso {step.position}</h2>
        {!disabled && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Subir paso ${step.position}`}
              disabled={stepIndex === 0}
              onClick={() => onMove('up')}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Bajar paso ${step.position}`}
              disabled={stepIndex === stepCount - 1}
              onClick={() => onMove('down')}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              aria-label={`Eliminar paso ${step.position}`}
              onClick={onRemove}
            >
              <Trash2Icon />
            </Button>
          </div>
        )}
      </header>

      <Field data-invalid={machineTypeError !== undefined}>
        <FieldLabel htmlFor={machineTypeId}>{`Paso ${step.position} · Tipo de máquina`}</FieldLabel>
        <Input
          id={machineTypeId}
          value={step.machineType}
          onChange={(event) =>
            onChangeStep((current) => ({ ...current, machineType: event.target.value }))
          }
          list="recipe-machine-types"
          placeholder="mixer"
          disabled={disabled}
          aria-invalid={machineTypeError !== undefined}
          aria-describedby={machineTypeError !== undefined ? machineTypeErrorId : undefined}
        />
        <FieldError id={machineTypeErrorId}>{machineTypeError}</FieldError>
      </Field>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Insumos</h3>
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={onAddInput}>
              <PlusIcon />
              Agregar insumo
            </Button>
          )}
        </div>
        {step.inputs.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Este paso no consume insumos.
          </p>
        ) : (
          step.inputs.map((input, inputIndex) => (
            <InputRow
              key={input.key}
              step={step}
              input={input}
              inputIndex={inputIndex}
              materials={materials}
              validationIssues={validationIssues}
              disabled={disabled}
              onChangeMaterial={(materialId) =>
                onChangeInput(input.key, (current) => {
                  if (materialId === current.materialId) {
                    return current;
                  }
                  const selected = findMaterial(materials, materialId);
                  return selected
                    ? {
                        ...current,
                        materialId: selected.id,
                        quantity: { ...current.quantity, unit: selected.unitOfMeasure },
                      }
                    : { ...current, materialId };
                })
              }
              onChangeAmount={(amount) =>
                onChangeInput(input.key, (current) => ({
                  ...current,
                  quantity: { ...current.quantity, amount },
                }))
              }
              onChangeUnit={(unit) =>
                onChangeInput(input.key, (current) => ({
                  ...current,
                  quantity: { ...current.quantity, unit },
                }))
              }
              onRemove={() => onRemoveInput(input.key)}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <h3 className="text-sm font-medium">Salida</h3>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-start">
          <div className="flex flex-col gap-2">
            <SelectField
              label={`Paso ${step.position} · Producto de salida`}
              value={step.outputProductId}
              onValueChange={(materialId) => onChangeOutput(findMaterial(materials, materialId))}
              options={materialOptions(materials, 'product')}
              placeholder="Elegí un producto"
              disabled={disabled}
            />
            <FieldError>{outputProductError}</FieldError>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Solo se ofrecen materiales de tipo producto; la unidad se deriva del material.
          </p>
        </div>
        <QuantityFields
          amountLabel={`Paso ${step.position} · Cantidad de salida`}
          unitLabelText={`Paso ${step.position} · Unidad de salida`}
          quantity={step.outputQuantity}
          material={stepOutput}
          amountError={issueForPath(
            validationIssues,
            `steps.${step.position}.outputQuantity.amount`,
          )}
          unitError={issueForPath(validationIssues, `steps.${step.position}.outputQuantity.unit`)}
          disabled={disabled}
          onAmountChange={(amount) =>
            onChangeStep((current) => ({
              ...current,
              outputQuantity: { ...current.outputQuantity, amount },
            }))
          }
          onUnitChange={(unit) =>
            onChangeStep((current) => ({
              ...current,
              outputQuantity: { ...current.outputQuantity, unit },
            }))
          }
        />
      </div>
    </article>
  );
}

// (sin helper adicional: el cambio de material se aplica directamente sobre el insumo)

export function RecipeBuilder({
  mode,
  initialState,
  materials,
  machineTypes,
  busy = false,
  readOnly = false,
  serverError = null,
  onSubmit,
  onCancel,
}: RecipeBuilderProps) {
  const [state, setState] = useState(initialState);
  const [validation, setValidation] = useState<ReturnType<typeof validateRecipe> | null>(null);
  const nameId = useId();
  const nameErrorId = useId();

  function mutate(updater: (current: RecipeBuilderState) => RecipeBuilderState): void {
    setState((current) => updater(current));
    setValidation(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (readOnly) {
      return;
    }
    const result = validateRecipe(state, materials);
    setValidation(result);
    if (result.valid) {
      onSubmit(toRecipePayload(state));
    }
  }

  const products = materials.filter((material) => material.kind === 'product');
  const outputProduct = findMaterial(materials, state.outputProductId);
  const issues = validation?.issues ?? [];
  const hasErrors = validation !== null && !validation.valid;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {readOnly && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Solo lectura: tu rol no puede modificar recetas.
        </p>
      )}

      {hasErrors && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p className="font-medium">No se puede guardar la receta. Revisá estos puntos:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {issues.map((issue) => (
              <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {serverError && (
        <div className="flex flex-col gap-2">
          <QueryError error={serverError} />
          <ServerErrorDetails error={serverError} />
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <h2 className="font-heading text-base font-medium">Receta</h2>
        <Field data-invalid={issueForPath(issues, 'name') !== undefined}>
          <FieldLabel htmlFor={nameId}>Nombre de la receta</FieldLabel>
          <Input
            id={nameId}
            value={state.name}
            onChange={(event) =>
              mutate((current) => updateRecipe(current, { name: event.target.value }))
            }
            placeholder="Pan artesanal"
            disabled={readOnly}
            aria-invalid={issueForPath(issues, 'name') !== undefined}
            aria-describedby={issueForPath(issues, 'name') !== undefined ? nameErrorId : undefined}
          />
          <FieldError id={nameErrorId}>{issueForPath(issues, 'name')}</FieldError>
        </Field>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-start">
          <div className="flex flex-col gap-2">
            <SelectField
              label="Producto de salida"
              value={state.outputProductId}
              onValueChange={(materialId) =>
                mutate((current) =>
                  selectOutputProduct(current, findMaterial(materials, materialId)),
                )
              }
              options={products.map((product) => ({
                value: product.id,
                label: product.active ? product.name : `${product.name} (inactivo)`,
              }))}
              placeholder="Elegí un producto"
              disabled={readOnly}
            />
            <FieldError>{issueForPath(issues, 'outputProductId')}</FieldError>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            El producto de salida debe ser un material de tipo producto. El output del último paso
            debe coincidir con él (I7).
          </p>
        </div>

        <QuantityFields
          amountLabel="Cantidad de salida"
          unitLabelText="Unidad de salida"
          quantity={state.outputQuantity}
          material={outputProduct}
          amountError={issueForPath(issues, 'outputQuantity.amount')}
          unitError={issueForPath(issues, 'outputQuantity.unit')}
          disabled={readOnly}
          onAmountChange={(amount) =>
            mutate((current) => ({
              ...current,
              outputQuantity: { ...current.outputQuantity, amount },
            }))
          }
          onUnitChange={(unit) =>
            mutate((current) => ({
              ...current,
              outputQuantity: { ...current.outputQuantity, unit },
            }))
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg font-medium">Pasos</h2>
            <p className="text-sm text-muted-foreground">
              {mode === 'edit'
                ? 'Al guardar se reemplazan todos los pasos de la receta (no es un merge por posición).'
                : 'El orden de los pasos se guarda como posición 1..N.'}
            </p>
          </div>
          {!readOnly && (
            <Button type="button" variant="outline" onClick={() => mutate(addStep)}>
              <PlusIcon />
              Agregar paso
            </Button>
          )}
        </div>

        {state.steps.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-background px-6 py-8 text-center text-sm text-muted-foreground">
            Todavía no hay pasos. Agregá el primero para definir la transformación.
          </p>
        ) : (
          state.steps.map((step, stepIndex) => (
            <StepCard
              key={step.key}
              step={step}
              stepIndex={stepIndex}
              stepCount={state.steps.length}
              materials={materials}
              validationIssues={issues}
              disabled={readOnly}
              onChangeStep={(updater) =>
                mutate((current) => updateStep(current, step.key, updater))
              }
              onChangeInput={(inputKey, updater) =>
                mutate((current) => updateInput(current, step.key, inputKey, updater))
              }
              onChangeOutput={(material) =>
                mutate((current) => selectStepOutputProduct(current, step.key, material))
              }
              onRemoveInput={(inputKey) =>
                mutate((current) => removeInput(current, step.key, inputKey))
              }
              onAddInput={() => mutate((current) => addInput(current, step.key))}
              onMove={(direction) => mutate((current) => moveStep(current, step.key, direction))}
              onRemove={() => mutate((current) => removeStep(current, step.key))}
            />
          ))
        )}

        <datalist id="recipe-machine-types">
          {machineTypes.map((machineType) => (
            <option key={machineType} value={machineType} />
          ))}
        </datalist>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {readOnly ? 'Volver' : 'Cancelar'}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear receta'}
          </Button>
        )}
      </div>
    </form>
  );
}
