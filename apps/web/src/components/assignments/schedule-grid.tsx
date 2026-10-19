'use client';

import type { DayOfWeek } from '@fabrik/domain';
import { XIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import type { AssignmentWire } from '@/lib/api/types';
import { formatTimeSlot } from '@/lib/format/days';

import { DISPLAY_DAYS } from './time-slot-draft';

/**
 * Grilla semanal de asignaciones (docs/pantallas.md §Pantalla 8): columnas
 * lun-dom (orden de semana laboral) y tarjetas de franja con
 * `HH:mm-HH:mm` + nombre de la contraparte (worker cuando se mira una máquina,
 * máquina cuando se mira un worker). El nombre lo resuelve la pantalla porque
 * la API anida solo ids (`AssignmentWire`).
 */

export interface ScheduleGridProps {
  readonly assignments: readonly AssignmentWire[];
  /** Nombre de la contraparte de cada asignación (worker o máquina según vista). */
  readonly counterpartLabel: (assignment: AssignmentWire) => string;
  readonly canWrite: boolean;
  readonly onUnassign?: (assignment: AssignmentWire) => void;
  readonly emptyTitle: string;
  readonly emptyDescription?: string;
}

const FULL_DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

function slotOrder(assignment: AssignmentWire): string {
  return `${assignment.slot.start}~${assignment.slot.end}`;
}

export function ScheduleGrid({
  assignments,
  counterpartLabel,
  canWrite,
  onUnassign,
  emptyTitle,
  emptyDescription,
}: ScheduleGridProps) {
  if (assignments.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-x-auto">
      <div data-slot="schedule-grid" className="grid min-w-[720px] grid-cols-7 gap-3">
        {DISPLAY_DAYS.map((day) => {
          const dayAssignments = assignments
            .filter((assignment) => assignment.slot.daysOfWeek.includes(day))
            .sort((a, b) => slotOrder(a).localeCompare(slotOrder(b)) || a.id.localeCompare(b.id));

          return (
            <section
              key={day}
              data-slot="schedule-day"
              data-day={day}
              aria-label={FULL_DAY_NAMES[day]}
              className="flex min-w-0 flex-col gap-2"
            >
              <h3 className="border-b pb-1.5 text-center text-xs font-medium text-muted-foreground">
                {FULL_DAY_NAMES[day]}
              </h3>

              {dayAssignments.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground/60">—</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dayAssignments.map((assignment) => (
                    <li
                      key={assignment.id}
                      data-slot="schedule-slot"
                      className="rounded-lg border bg-background p-2.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-medium tabular-nums">
                          {assignment.slot.start}–{assignment.slot.end}
                        </span>
                        {canWrite && onUnassign && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Desasignar ${counterpartLabel(assignment)} (${formatTimeSlot(assignment.slot)})`}
                            onClick={() => onUnassign(assignment)}
                          >
                            <XIcon />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {counterpartLabel(assignment)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
