import type { Actor, MachineStatus, MachineType } from '@fabrik/domain';
import { LocationId, MachineId } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';
import { machineToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { MachineWire } from '../types';

/**
 * Endpoints de máquinas (`apps/api/src/machines/machines.controller.ts`) sobre
 * el **runtime demo** (docs/11-plan-demo.md §4): los cinco casos de uso que
 * inyecta el controlador real (`CreateMachine`, `UpdateMachine`, `MoveMachine`,
 * `GetMachine`, `ListMachines`), ejecutados con el actor de la sesión.
 *
 * - `list` (A/Au): filtros `locationId`/`status`/`type`; **worker → 403**.
 * - `get` — id desconocido → `NotFoundError` → 404.
 * - `create`/`update`/`move` — admin. `create` y `move` validan **I2** en el
 *   dominio (el lugar debe existir y ser `production`):
 *   `NotFoundError` → 404, `InvalidLocationKindError` → 422. `update` no toca
 *   el lugar (el cambio de lugar es `move`, con su propio evento
 *   `machine.moved`).
 * - `status` es solo de lectura (`idle`/`running`/`maintenance`): el dominio no
 *   tiene transiciones por HTTP (deuda ya documentada) — el wire las refleja
 *   tal cual.
 */

export interface ListMachinesParams {
  readonly locationId?: string;
  readonly status?: MachineStatus;
  readonly type?: string;
}

export interface CreateMachineInput {
  readonly name: string;
  readonly type: MachineType;
  readonly locationId: string;
}

export interface UpdateMachineInput {
  readonly name?: string;
  readonly type?: MachineType;
}

export interface MoveMachineInput {
  readonly locationId: string;
}

export interface MachinesApi {
  list(params?: ListMachinesParams): Promise<MachineWire[]>;
  get(id: string): Promise<MachineWire>;
  create(input: CreateMachineInput): Promise<MachineWire>;
  update(id: string, input: UpdateMachineInput): Promise<MachineWire>;
  move(id: string, input: MoveMachineInput): Promise<MachineWire>;
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

export function createMachinesApi(ctx: DemoContext = getDemoContext()): MachinesApi {
  return {
    async list(params) {
      try {
        const actor = await requireActorForCall(ctx);
        const machines = await ctx.registry.useCases.machines.ListMachines.execute(actor, {
          filter: {
            ...(params?.locationId !== undefined
              ? { locationId: LocationId.from(params.locationId) }
              : {}),
            ...(params?.status !== undefined ? { status: params.status } : {}),
            ...(params?.type !== undefined ? { type: params.type } : {}),
          },
        });
        return machines.map(machineToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async get(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const machine = await ctx.registry.useCases.machines.GetMachine.execute(actor, {
          id: MachineId.from(id),
        });
        return machineToWire(machine);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async create(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const machine = await ctx.registry.useCases.machines.CreateMachine.execute(actor, {
          name: input.name,
          type: input.type,
          locationId: LocationId.from(input.locationId),
        });
        return machineToWire(machine);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async update(id, input) {
      try {
        const actor = await requireActorForCall(ctx);
        const machine = await ctx.registry.useCases.machines.UpdateMachine.execute(actor, {
          id: MachineId.from(id),
          ...input,
        });
        return machineToWire(machine);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async move(id, input) {
      try {
        const actor = await requireActorForCall(ctx);
        const machine = await ctx.registry.useCases.machines.MoveMachine.execute(actor, {
          id: MachineId.from(id),
          locationId: LocationId.from(input.locationId),
        });
        return machineToWire(machine);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const machinesApi: MachinesApi = createMachinesApi();
