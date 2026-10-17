import type { Assignment } from '@fabrik/domain';
import { z } from 'zod';

import { idSchema, timeSlotSchema } from '../common/catalog-schemas.js';
import { serializeTimeSlot, type TimeSlotResponse } from '../common/entity-serializers.js';

/** DTOs del recurso `assignments` (Fase 4). */

/** `POST /assignments`. */
export const CreateAssignmentSchema = z.object({
  workerId: idSchema,
  machineId: idSchema,
  slot: timeSlotSchema,
});
export type CreateAssignmentDto = z.infer<typeof CreateAssignmentSchema>;

export interface AssignmentResponse {
  readonly id: string;
  readonly workerId: string;
  readonly machineId: string;
  readonly slot: TimeSlotResponse;
}

export function serializeAssignment(assignment: Assignment): AssignmentResponse {
  return {
    id: assignment.id,
    workerId: assignment.workerId,
    machineId: assignment.machineId,
    slot: serializeTimeSlot(assignment.slot),
  };
}
