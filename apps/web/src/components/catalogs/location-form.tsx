'use client';

import type { LocationKind } from '@fabrik/domain';
import { type FormEvent, useId, useState } from 'react';

import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LOCATION_KIND_LABELS } from '@/lib/format/labels';

/**
 * Formulario de ubicación (docs/10-plan-de-web.md §4). En modo `edit` el tipo es
 * de solo lectura: `PATCH /locations/:id` **solo renombra** (cambiar `kind`
 * violaría I2).
 */

export interface LocationFormValues {
  readonly name: string;
  readonly kind: LocationKind;
}

export interface LocationFormProps {
  readonly mode?: 'create' | 'edit';
  readonly defaultValues?: Partial<LocationFormValues>;
  readonly busy?: boolean;
  readonly onSubmit: (values: LocationFormValues) => void;
  readonly onCancel: () => void;
}

const KIND_OPTIONS = (Object.keys(LOCATION_KIND_LABELS) as LocationKind[]).map((kind) => ({
  value: kind,
  label: LOCATION_KIND_LABELS[kind],
}));

export function LocationForm({
  mode = 'create',
  defaultValues,
  busy = false,
  onSubmit,
  onCancel,
}: LocationFormProps) {
  const nameId = useId();
  const nameErrorId = useId();
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [kind, setKind] = useState<LocationKind>(defaultValues?.kind ?? 'production');
  const [error, setError] = useState<string | null>(null);

  const editing = mode === 'edit';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError('El nombre es obligatorio.');
      return;
    }
    setError(null);
    onSubmit({ name: trimmedName, kind });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor={nameId}>Nombre</FieldLabel>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Planta baja"
          aria-invalid={error !== null}
          aria-describedby={error !== null ? nameErrorId : undefined}
          autoFocus
        />
        <FieldError id={nameErrorId}>{error}</FieldError>
      </Field>

      <SelectField
        label="Tipo"
        value={kind}
        onValueChange={(value) => setKind(value as LocationKind)}
        options={KIND_OPTIONS}
        disabled={editing}
      />
      {editing && (
        <p className="text-xs text-muted-foreground">El tipo de ubicación no se puede cambiar.</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear ubicación'}
        </Button>
      </div>
    </form>
  );
}
