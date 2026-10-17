'use client';

import type { WorkerRole } from '@fabrik/domain';
import { type FormEvent, useState } from 'react';

import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { WORKER_ROLE_LABELS } from '@/lib/format/labels';

/**
 * Formulario de trabajador (docs/10-plan-de-web.md §6). El rol se puede cambiar
 * en alta y edición (`PATCH /workers/:id` acepta `name` y `role`).
 */

export interface WorkerFormValues {
  readonly name: string;
  readonly role: WorkerRole;
}

export interface WorkerFormProps {
  readonly mode?: 'create' | 'edit';
  readonly defaultValues?: Partial<WorkerFormValues>;
  readonly busy?: boolean;
  readonly onSubmit: (values: WorkerFormValues) => void;
  readonly onCancel: () => void;
}

const ROLE_OPTIONS = (Object.keys(WORKER_ROLE_LABELS) as WorkerRole[]).map((role) => ({
  value: role,
  label: WORKER_ROLE_LABELS[role],
}));

export function WorkerForm({
  mode = 'create',
  defaultValues,
  busy = false,
  onSubmit,
  onCancel,
}: WorkerFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [role, setRole] = useState<WorkerRole>(defaultValues?.role ?? 'worker');
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
    onSubmit({ name: trimmedName, role });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field data-invalid={error !== null}>
        <FieldLabel>Nombre</FieldLabel>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ada Lovelace"
          aria-label="Nombre"
          aria-invalid={error !== null}
          autoFocus
        />
        <FieldError>{error}</FieldError>
      </Field>

      <SelectField
        label="Rol"
        value={role}
        onValueChange={(value) => setRole(value as WorkerRole)}
        options={ROLE_OPTIONS}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear trabajador'}
        </Button>
      </div>
    </form>
  );
}
