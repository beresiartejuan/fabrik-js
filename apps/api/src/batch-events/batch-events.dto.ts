import { z } from 'zod';

import { idSchema } from '../common/catalog-schemas.js';

/**
 * DTO del recurso `batch-events` (Fase 6, docs/09).
 *
 * `GET /batch-events` acepta filtros **opcionales**: `?machineId=`, `?workerId=`,
 * `?materialId=` y el rango temporal inclusivo `?from=`/`?to=` (ISO 8601, con
 * offset). Aquí solo se valida la **forma** y se convierten los extremos a `Date`;
 * el filtrado (material aparece en inputs **o** outputs, orden cronológico) lo
 * aplica `ListBatchEvents`. Un valor no-ISO → 400 del `ZodValidationPipe`.
 */
export const BatchEventsQuerySchema = z.object({
  machineId: idSchema.optional(),
  workerId: idSchema.optional(),
  materialId: idSchema.optional(),
  from: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  to: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
});
export type BatchEventsQuery = z.infer<typeof BatchEventsQuerySchema>;
