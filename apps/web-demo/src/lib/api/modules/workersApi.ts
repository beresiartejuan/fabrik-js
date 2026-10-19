import type { Actor, WorkerRole } from '@fabrik/domain';
import { WorkerId } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';
import { workerToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { WorkerWire } from '../types';

/**
 * Endpoints de trabajadores (`apps/api/src/workers/workers.controller.ts`)
 * sobre el **runtime demo** (docs/11-plan-demo.md §4): los cinco casos de uso
 * que inyecta el controlador real (`CreateWorker`, `UpdateWorker`,
 * `DeactivateWorker`, `GetWorker`, `ListWorkers`), ejecutados con el actor de
 * la sesión.
 *
 * - `list` (A/Au): filtros `role`/`active`; **worker → 403** (gate del dominio).
 * - `get` — id desconocido → `NotFoundError` → 404.
 * - `create`/`update`/`deactivate` — admin. Gratis en dominio, las invariantes
 *   anti-lockout salen por el mismo camino que en la API: un admin no puede
 *   cambiarse el rol ni desactivarse a sí mismo
 *   (`SelfModificationNotAllowedError` → 409).
 * - Sin `reactivate`: el dominio tiene `Worker.activate()` pero no un caso de
 *   uso expuesto (deuda de API, docs/10-plan-de-web.md §Gaps) — el contrato se
 *   mantiene idéntico al módulo axios.
 */

export interface ListWorkersParams {
  readonly role?: WorkerRole;
  readonly active?: boolean;
}

export interface CreateWorkerInput {
  readonly name: string;
  readonly role: WorkerRole;
}

export interface UpdateWorkerInput {
  readonly name?: string;
  readonly role?: WorkerRole;
}

export interface WorkersApi {
  list(params?: ListWorkersParams): Promise<WorkerWire[]>;
  get(id: string): Promise<WorkerWire>;
  create(input: CreateWorkerInput): Promise<WorkerWire>;
  update(id: string, input: UpdateWorkerInput): Promise<WorkerWire>;
  deactivate(id: string): Promise<WorkerWire>;
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

export function createWorkersApi(ctx: DemoContext = getDemoContext()): WorkersApi {
  return {
    async list(params) {
      try {
        const actor = await requireActorForCall(ctx);
        const workers = await ctx.registry.useCases.workers.ListWorkers.execute(actor, {
          filter: {
            ...(params?.role !== undefined ? { role: params.role } : {}),
            ...(params?.active !== undefined ? { active: params.active } : {}),
          },
        });
        return workers.map(workerToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async get(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const worker = await ctx.registry.useCases.workers.GetWorker.execute(actor, {
          id: WorkerId.from(id),
        });
        return workerToWire(worker);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async create(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const worker = await ctx.registry.useCases.workers.CreateWorker.execute(actor, input);
        return workerToWire(worker);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async update(id, input) {
      try {
        const actor = await requireActorForCall(ctx);
        const worker = await ctx.registry.useCases.workers.UpdateWorker.execute(actor, {
          id: WorkerId.from(id),
          ...input,
        });
        return workerToWire(worker);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async deactivate(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const worker = await ctx.registry.useCases.workers.DeactivateWorker.execute(actor, {
          id: WorkerId.from(id),
        });
        return workerToWire(worker);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const workersApi: WorkersApi = createWorkersApi();
