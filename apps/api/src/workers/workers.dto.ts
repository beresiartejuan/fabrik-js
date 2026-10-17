import { z } from 'zod';
import type { Worker } from '@fabrik/domain';

import { WORKER_ROLES, booleanQuerySchema } from '../common/catalog-schemas.js';

/** DTOs del recurso `workers` (Fase 4). */

/** `POST /workers`. */
export const CreateWorkerSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  role: z.enum(WORKER_ROLES),
});
export type CreateWorkerDto = z.infer<typeof CreateWorkerSchema>;

/** `PATCH /workers/:id` (nombre y/o rol). */
export const UpdateWorkerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(WORKER_ROLES).optional(),
});
export type UpdateWorkerDto = z.infer<typeof UpdateWorkerSchema>;

/** `GET /workers` (filtros de `WorkerFilter`). */
export const ListWorkersQuerySchema = z.object({
  role: z.enum(WORKER_ROLES).optional(),
  active: booleanQuerySchema.optional(),
});
export type ListWorkersQuery = z.infer<typeof ListWorkersQuerySchema>;

export interface WorkerResponse {
  readonly id: string;
  readonly name: string;
  readonly role: Worker['role'];
  readonly active: boolean;
}

export function serializeWorker(worker: Worker): WorkerResponse {
  return { id: worker.id, name: worker.name, role: worker.role, active: worker.active };
}
