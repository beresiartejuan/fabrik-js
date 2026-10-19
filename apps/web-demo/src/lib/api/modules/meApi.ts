import type { Actor } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';
import { assignmentToWire, machineToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { MeScheduleItemWire } from '../types';

/**
 * Endpoint del **propio** actor (`apps/api/src/me/me.controller.ts` —
 * `GET /me/schedule`) sobre el **runtime demo** (docs/11-plan-demo.md §4).
 *
 * **No es un caso de uso**: el `MeController` real lo arma con lecturas de
 * apoyo (`ListWorkerSchedule` para la agenda propia + `MachineRepository` para
 * la máquina enriquecida) y calcula `activeNow` con el reloj del proceso. El
 * módulo demo replica el armado exacto con las mismas piezas de `ctx`:
 *
 * - La agenda sale del caso de uso `ListWorkerSchedule` (cualquier rol
 *   autenticado; para un `worker` siempre es su propia agenda: el caso de uso
 *   lo revalida).
 * - El catálogo de máquinas sale **de una sola lectura del repositorio** (el
 *   mismo atajo que el controlador: `ListMachines` descartado porque exige rol
 *   A/Au y un operario recibiría 403 en su propia agenda). El contrato admite
 *   `machine: null` si el dato estuviera huérfano.
 * - `activeNow = assignment.slot.contains(now)` con **un solo `now`**
 *   (`ctx.clock()`, el reloj del navegador — el navegador no debe recalcular
 *   `TimeSlot.contains` por su cuenta; en la API es el reloj del servidor,
 *   fuente de verdad de I3).
 */

export interface MeApi {
  schedule(): Promise<MeScheduleItemWire[]>;
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

export function createMeApi(ctx: DemoContext = getDemoContext()): MeApi {
  return {
    async schedule() {
      try {
        const actor = await requireActorForCall(ctx);
        const assignments = await ctx.registry.useCases.assignments.ListWorkerSchedule.execute(
          actor,
          { workerId: actor.workerId },
        );

        // Una sola lectura del catálogo de máquinas (agendas pequeñas) en vez de
        // N+1 `findById`, igual que el `MeController` real.
        const machines = await ctx.repos.machines.list();
        const machinesById = new Map(machines.map((machine) => [machine.id, machine]));

        // Un solo `now` para todos los ítems de la respuesta, como en la API.
        const now = ctx.clock();
        return assignments.map((assignment) => {
          const machine = machinesById.get(assignment.machineId);
          return {
            ...assignmentToWire(assignment),
            machine: machine ? machineToWire(machine) : null,
            activeNow: assignment.slot.contains(now),
          };
        });
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const meApi: MeApi = createMeApi();
