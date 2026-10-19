import type { Actor, DayOfWeek } from '@fabrik/domain';
import { AssignmentId, MachineId, TimeSlot, WorkerId } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';
import { assignmentToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { AssignmentWire, TimeSlotWire } from '../types';

/**
 * Endpoints de asignaciones y agendas
 * (`apps/api/src/assignments/{assignments,schedule}.controller.ts`) sobre el
 * **runtime demo** (docs/demo.md §4): los cuatro casos de uso que
 * inyectan los controladores reales, ejecutados con el actor de la sesión.
 *
 * - `assign` (admin): body `{ workerId, machineId, slot }` — `TimeSlot.create`
 *   revalida el formato (`InvalidTimeSlotError` → 422, sustituye al 400 de
 *   zod), el caso de uso valida worker activo/máquina e **I1**
 *   (`InactiveWorkerError` → 409, `OverlappingScheduleError` → 409) y publica
 *   `worker.assigned`.
 * - `unassign` (admin): borrado real → `void` (204 en la API); id desconocido
 *   → 404.
 * - `workerSchedule`/`machineSchedule` (A/Au): 404 si el worker/máquina no
 *   existe. Un `worker` solo puede leer **su propia** agenda con
 *   `workerSchedule` (`UnauthorizedRoleError` → 403 si pide la de otro); la
 *   agenda de máquinas le queda 403 — la del operario es `meApi.schedule()`.
 */

export interface AssignWorkerInput {
  readonly workerId: string;
  readonly machineId: string;
  readonly slot: TimeSlotWire;
}

export interface AssignmentsApi {
  assign(input: AssignWorkerInput): Promise<AssignmentWire>;
  unassign(assignmentId: string): Promise<void>;
  workerSchedule(workerId: string): Promise<AssignmentWire[]>;
  machineSchedule(machineId: string): Promise<AssignmentWire[]>;
}

/**
 * Pasos de arranque de cada operación (kit §Convención): el histórico arranca
 * **una vez por pestaña** (`ensureDemoContext`) y el actor sale del token
 * **leído en la llamada** — nunca se cachea.
 */
async function requireActorForCall(ctx: DemoContext): Promise<Actor> {
  await ensureDemoContext();
  return ctx.requireActor(readTokens()?.accessToken ?? '');
}

export function createAssignmentsApi(ctx: DemoContext = getDemoContext()): AssignmentsApi {
  return {
    async assign(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const assignment = await ctx.registry.useCases.assignments.AssignWorkerToMachine.execute(
          actor,
          {
            workerId: WorkerId.from(input.workerId),
            machineId: MachineId.from(input.machineId),
            slot: TimeSlot.create(
              input.slot.daysOfWeek as readonly DayOfWeek[],
              input.slot.start,
              input.slot.end,
            ),
          },
        );
        return assignmentToWire(assignment);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async unassign(assignmentId) {
      try {
        const actor = await requireActorForCall(ctx);
        await ctx.registry.useCases.assignments.UnassignWorker.execute(actor, {
          assignmentId: AssignmentId.from(assignmentId),
        });
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async workerSchedule(workerId) {
      try {
        const actor = await requireActorForCall(ctx);
        const assignments = await ctx.registry.useCases.assignments.ListWorkerSchedule.execute(
          actor,
          { workerId: WorkerId.from(workerId) },
        );
        return assignments.map(assignmentToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async machineSchedule(machineId) {
      try {
        const actor = await requireActorForCall(ctx);
        const assignments = await ctx.registry.useCases.assignments.ListMachineSchedule.execute(
          actor,
          { machineId: MachineId.from(machineId) },
        );
        return assignments.map(assignmentToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const assignmentsApi: AssignmentsApi = createAssignmentsApi();
