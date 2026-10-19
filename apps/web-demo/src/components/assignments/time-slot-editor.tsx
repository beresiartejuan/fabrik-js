'use client';

import type { DayOfWeek } from '@fabrik/domain';
import { useId } from 'react';

import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDays } from '@/lib/format/days';

import {
  changeEnd,
  changeStart,
  DISPLAY_DAYS,
  issueForField,
  type SlotDraftIssue,
  type TimeSlotDraft,
} from './time-slot-draft';

/**
 * Editor de `TimeSlot` reutilizable (docs/10-plan-de-web.md §Pantalla 8):
 * días como toggles múltiples (lunes primero) + horas `HH:mm` en texto libre
 * con validación inline (el `end` admite `24:00`). Recibe el borrador y los
 * `issues` de `validateSlotDraft`; el componente no decide nada de dominio.
 *
 * El `ToggleGroup` de base-ui acota sus valores a `string`, así que los días
 * viajan como string en la UI y vuelven a `DayOfWeek` numérico al salir.
 */
export interface TimeSlotEditorProps {
  readonly value: TimeSlotDraft;
  readonly onChange: (next: TimeSlotDraft) => void;
  readonly issues?: readonly SlotDraftIssue[];
  readonly disabled?: boolean;
}

function normalizeDays(values: readonly string[]): DayOfWeek[] {
  const unique = new Set<number>(
    values
      .map((value) => Number(value))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
  return Array.from(unique).sort((a, b) => a - b) as DayOfWeek[];
}

export function TimeSlotEditor({ value, onChange, issues, disabled }: TimeSlotEditorProps) {
  const startId = useId();
  const startErrorId = useId();
  const endId = useId();
  const endErrorId = useId();
  const shownIssues = issues ?? [];
  const daysError = issueForField(shownIssues, 'days');
  const startError = issueForField(shownIssues, 'start');
  const endError = issueForField(shownIssues, 'end');
  const rangeError = issueForField(shownIssues, 'range');

  return (
    <div className="flex flex-col gap-3">
      <Field data-invalid={daysError !== undefined}>
        <FieldLabel>Días</FieldLabel>
        <ToggleGroup
          multiple
          value={value.days.map(String)}
          onValueChange={(next) => onChange({ ...value, days: normalizeDays(next) })}
          disabled={disabled}
        >
          {DISPLAY_DAYS.map((day) => (
            <ToggleGroupItem
              key={day}
              value={String(day)}
              aria-label={`Día ${formatDays([day])}`}
              variant="outline"
            >
              {formatDays([day])}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldError>{daysError}</FieldError>
      </Field>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Field data-invalid={startError !== undefined}>
          <FieldLabel htmlFor={startId}>Hora de inicio (HH:mm)</FieldLabel>
          <Input
            id={startId}
            value={value.start}
            onChange={(event) => onChange(changeStart(value, event.target.value))}
            placeholder="08:00"
            inputMode="numeric"
            disabled={disabled}
            aria-invalid={startError !== undefined}
            aria-describedby={startError !== undefined ? startErrorId : undefined}
          />
          <FieldError id={startErrorId}>{startError}</FieldError>
        </Field>

        <Field data-invalid={endError !== undefined}>
          <FieldLabel htmlFor={endId}>Hora de fin (HH:mm o 24:00)</FieldLabel>
          <Input
            id={endId}
            value={value.end}
            onChange={(event) => onChange(changeEnd(value, event.target.value))}
            placeholder="16:00"
            inputMode="numeric"
            disabled={disabled}
            aria-invalid={endError !== undefined}
            aria-describedby={endError !== undefined ? endErrorId : undefined}
          />
          <FieldError id={endErrorId}>{endError}</FieldError>
        </Field>
      </div>

      <FieldError>{rangeError}</FieldError>
    </div>
  );
}
