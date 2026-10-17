import type { Machine } from '@fabrik/domain';
import { z } from 'zod';

import { idSchema, MACHINE_STATUSES } from '../common/catalog-schemas.js';

/** DTOs del recurso `machines` (Fase 4). */

/** `POST /machines`. `type` es un catálogo abierto (`MachineType = string`). */
export const CreateMachineSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  type: z.string().trim().min(1, 'El tipo es obligatorio'),
  locationId: idSchema,
});
export type CreateMachineDto = z.infer<typeof CreateMachineSchema>;

/** `PATCH /machines/:id` (nombre y/o tipo; el lugar se cambia con `/move`). */
export const UpdateMachineSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
});
export type UpdateMachineDto = z.infer<typeof UpdateMachineSchema>;

/** `POST /machines/:id/move`. */
export const MoveMachineSchema = z.object({
  locationId: idSchema,
});
export type MoveMachineDto = z.infer<typeof MoveMachineSchema>;

/** `GET /machines` (filtros de `MachineFilter`). */
export const ListMachinesQuerySchema = z.object({
  locationId: idSchema.optional(),
  status: z.enum(MACHINE_STATUSES).optional(),
  type: z.string().trim().min(1).optional(),
});
export type ListMachinesQuery = z.infer<typeof ListMachinesQuerySchema>;

export interface MachineResponse {
  readonly id: string;
  readonly name: string;
  readonly type: Machine['type'];
  readonly locationId: string;
  readonly status: Machine['status'];
}

export function serializeMachine(machine: Machine): MachineResponse {
  return {
    id: machine.id,
    name: machine.name,
    type: machine.type,
    locationId: machine.locationId,
    status: machine.status,
  };
}
