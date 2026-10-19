'use client';

import { type FormEvent, useId, useState } from 'react';

import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { LocationWire } from '@/lib/api/types';
import { LOCATION_KIND_LABELS } from '@/lib/format/labels';

/**
 * Formulario de máquina (docs/10-plan-de-web.md §5). El `locationId` solo ofrece
 * **lugares de producción**: la API valida I2 (`InvalidLocationKindError`) al
 * crear/mover, así que no se ofrecen destinos inválidos.
 *
 * El `type` es catálogo abierto (`MachineType = string`): se sugiere con un
 * `datalist` de tipos ya existentes y se permite escribir uno nuevo.
 *
 * En modo `edit` el lugar es de solo lectura: `PATCH /machines/:id` no lo admite;
 * mover una máquina tiene su propio endpoint/evento (`POST /machines/:id/move`).
 */

export interface MachineFormValues {
  readonly name: string;
  readonly type: string;
  readonly locationId: string;
}

export interface MachineFormProps {
  readonly mode?: 'create' | 'edit';
  readonly defaultValues?: Partial<MachineFormValues>;
  readonly locations: readonly LocationWire[];
  readonly machineTypes?: readonly string[];
  readonly busy?: boolean;
  readonly onSubmit: (values: MachineFormValues) => void;
  readonly onCancel: () => void;
}

export function MachineForm({
  mode = 'create',
  defaultValues,
  locations,
  machineTypes = [],
  busy = false,
  onSubmit,
  onCancel,
}: MachineFormProps) {
  const typeListId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const typeId = useId();
  const typeErrorId = useId();
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [type, setType] = useState(defaultValues?.type ?? '');
  const [locationId, setLocationId] = useState(defaultValues?.locationId ?? '');
  const [errors, setErrors] = useState<{ name?: string; type?: string; locationId?: string }>({});

  const editing = mode === 'edit';
  const productionLocations = locations.filter((location) => location.kind === 'production');
  const locationOptions = productionLocations.map((location) => ({
    value: location.id,
    label: `${location.name} (${LOCATION_KIND_LABELS[location.kind]})`,
  }));

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const trimmedName = name.trim();
    const trimmedType = type.trim();
    if (trimmedName.length === 0) {
      nextErrors.name = 'El nombre es obligatorio.';
    }
    if (trimmedType.length === 0) {
      nextErrors.type = 'El tipo es obligatorio.';
    }
    if (!editing && locationId.length === 0) {
      nextErrors.locationId = 'Elegí un lugar de producción.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    onSubmit({ name: trimmedName, type: trimmedType, locationId });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field data-invalid={errors.name !== undefined}>
        <FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Amasadora 1"
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name !== undefined ? nameErrorId : undefined}
          autoFocus
        />
        <FieldError id={nameErrorId}>{errors.name}</FieldError>
      </Field>

      <Field data-invalid={errors.type !== undefined}>
        <FieldLabel htmlFor={typeId}>Tipo</FieldLabel>
        <Input
          id={typeId}
          value={type}
          onChange={(event) => setType(event.target.value)}
          placeholder="amasadora"
          list={typeListId}
          aria-invalid={errors.type !== undefined}
          aria-describedby={errors.type !== undefined ? typeErrorId : undefined}
        />
        <datalist id={typeListId}>
          {machineTypes.map((machineType) => (
            <option key={machineType} value={machineType} />
          ))}
        </datalist>
        <FieldError id={typeErrorId}>{errors.type}</FieldError>
      </Field>

      <Field data-invalid={errors.locationId !== undefined}>
        <SelectField
          label="Lugar"
          value={locationId}
          onValueChange={setLocationId}
          options={locationOptions}
          placeholder="Elegí un lugar"
          disabled={editing}
          invalid={errors.locationId !== undefined}
        />
        {editing ? (
          <p className="text-xs text-muted-foreground">El lugar se cambia con la acción «Mover».</p>
        ) : null}
        <FieldError>{errors.locationId}</FieldError>
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear máquina'}
        </Button>
      </div>
    </form>
  );
}
