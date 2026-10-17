import { z } from 'zod';

import { BATCH_STATUSES, idSchema } from '../common/catalog-schemas.js';

/**
 * DTO del recurso `batches` (post-plan, hueco detectado por el plan de web,
 * `docs/10-plan-de-web.md`).
 *
 * `GET /batches` acepta los filtros **opcionales** de `BatchFilter` —
 * `?status=`, `?materialId=`, `?recipeId=` y `?originBatchEventId=`—; sin ninguno
 * devuelve todos los lotes. Aquí solo se valida la **forma** y el filtrado lo
 * aplica `ListBatches`/`BatchRepository`. Un `status` fuera del enum → 400 del
 * `ZodValidationPipe`.
 *
 * La respuesta se serializa con `serializeBatch` (compartido con `production` y
 * `trace`), así que no se re-declara la forma del lote en este fichero.
 */
export const ListBatchesQuerySchema = z.object({
  status: z.enum(BATCH_STATUSES).optional(),
  materialId: idSchema.optional(),
  recipeId: idSchema.optional(),
  originBatchEventId: idSchema.optional(),
});
export type ListBatchesQuery = z.infer<typeof ListBatchesQuerySchema>;
