'use client';

import {
  type MaterialKind,
  type PhysicalState,
  type UnitOfMeasure,
  unitsForPhysicalState,
} from '@fabrik/domain';
import { type FormEvent, useState } from 'react';

import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MATERIAL_KIND_LABELS, PHYSICAL_STATE_LABELS } from '@/lib/format/labels';
import { unitLabel } from '@/lib/format/units';

/**
 * Formulario de material (docs/10-plan-de-web.md §3). Las unidades se **filtran
 * por estado físico** con `unitsForPhysicalState` del dominio para no ofrecer
 * combinaciones inválidas (I3); al cambiar el estado se corrige la unidad si
 * quedó incompatible.
 *
 * En modo `edit` el tipo y el estado físico son de solo lectura: `PATCH
 * /materials/:id` solo admite nombre/descripción/unidad (no se puede mutar la
 * clasificación del material).
 */

export interface MaterialFormValues {
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
}

export interface MaterialFormProps {
  readonly mode?: 'create' | 'edit';
  readonly defaultValues?: Partial<MaterialFormValues>;
  readonly busy?: boolean;
  readonly onSubmit: (values: MaterialFormValues) => void;
  readonly onCancel: () => void;
}

const KIND_OPTIONS = (Object.keys(MATERIAL_KIND_LABELS) as MaterialKind[]).map((kind) => ({
  value: kind,
  label: MATERIAL_KIND_LABELS[kind],
}));

const STATE_OPTIONS = (Object.keys(PHYSICAL_STATE_LABELS) as PhysicalState[]).map((state) => ({
  value: state,
  label: PHYSICAL_STATE_LABELS[state],
}));

function firstCompatibleUnit(state: PhysicalState): UnitOfMeasure {
  return unitsForPhysicalState(state)[0];
}

export function MaterialForm({
  mode = 'create',
  defaultValues,
  busy = false,
  onSubmit,
  onCancel,
}: MaterialFormProps) {
  const initialPhysicalState = defaultValues?.physicalState ?? 'solid';
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  const [kind, setKind] = useState<MaterialKind>(defaultValues?.kind ?? 'supply');
  const [physicalState, setPhysicalState] = useState<PhysicalState>(initialPhysicalState);
  const [unitOfMeasure, setUnitOfMeasure] = useState<UnitOfMeasure>(
    defaultValues?.unitOfMeasure ?? firstCompatibleUnit(initialPhysicalState),
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const editing = mode === 'edit';
  const unitOptions = unitsForPhysicalState(physicalState).map((unit) => ({
    value: unit,
    label: unitLabel(unit),
  }));

  function handlePhysicalStateChange(next: string): void {
    const state = next as PhysicalState;
    setPhysicalState(state);
    if (!unitsForPhysicalState(state).includes(unitOfMeasure)) {
      setUnitOfMeasure(firstCompatibleUnit(state));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError('El nombre es obligatorio.');
      return;
    }
    setNameError(null);
    const trimmedDescription = description.trim();
    onSubmit({
      name: trimmedName,
      // En edición se envía **siempre** (incluso `''`) para poder borrar la
      // descripción: la API interpreta la ausencia como "sin cambio", así que
      // omitirla al vaciar el campo dejaría el valor anterior.
      ...(editing || trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
      kind,
      physicalState,
      unitOfMeasure,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field data-invalid={nameError !== null}>
        <FieldLabel>Nombre</FieldLabel>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Harina 000"
          aria-label="Nombre"
          aria-invalid={nameError !== null}
          autoFocus
        />
        <FieldError>{nameError}</FieldError>
      </Field>

      <Field>
        <FieldLabel>Descripción</FieldLabel>
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Opcional"
          aria-label="Descripción"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Tipo"
          value={kind}
          onValueChange={(value) => setKind(value as MaterialKind)}
          options={KIND_OPTIONS}
          disabled={editing}
        />
        <SelectField
          label="Estado físico"
          value={physicalState}
          onValueChange={handlePhysicalStateChange}
          options={STATE_OPTIONS}
          disabled={editing}
        />
      </div>

      <SelectField
        label="Unidad de medida"
        value={unitOfMeasure}
        onValueChange={(value) => setUnitOfMeasure(value as UnitOfMeasure)}
        options={unitOptions}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear material'}
        </Button>
      </div>
    </form>
  );
}
