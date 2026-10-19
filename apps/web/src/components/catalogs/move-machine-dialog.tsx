'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { FormDialog } from '@/components/shared/form-dialog';
import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import type { LocationWire, MachineWire } from '@/lib/api/types';
import { LOCATION_KIND_LABELS } from '@/lib/format/labels';

/**
 * Diálogo "Mover" de máquinas (docs/pantallas.md §5). El destino solo
 * ofrece lugares de **producción** (I2) y el movimiento va por su endpoint
 * `POST /machines/:id/move`, que además emite `machine.moved`.
 */

export interface MoveMachineDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly machine: MachineWire | null;
  readonly locations: readonly LocationWire[];
  readonly busy?: boolean;
  readonly onSubmit: (locationId: string) => void;
}

export function MoveMachineDialog({
  open,
  onOpenChange,
  machine,
  locations,
  busy = false,
  onSubmit,
}: MoveMachineDialogProps) {
  const [locationId, setLocationId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Al abrir, limpiamos la selección previa.
  useEffect(() => {
    if (open) {
      setLocationId('');
      setError(null);
    }
  }, [open]);

  const productionLocations = locations.filter((location) => location.kind === 'production');
  const targetOptions = productionLocations
    .filter((location) => location.id !== machine?.locationId)
    .map((location) => ({
      value: location.id,
      label: `${location.name} (${LOCATION_KIND_LABELS[location.kind]})`,
    }));

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (locationId.length === 0) {
      setError('Elegí el lugar de destino.');
      return;
    }
    setError(null);
    onSubmit(locationId);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mover máquina"
      description={
        machine ? `Elegí el lugar de producción de destino para «${machine.name}».` : undefined
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field data-invalid={error !== null}>
          <SelectField
            label="Lugar de destino"
            value={locationId}
            onValueChange={setLocationId}
            options={targetOptions}
            placeholder="Elegí un lugar"
            invalid={error !== null}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Moviendo…' : 'Mover'}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
