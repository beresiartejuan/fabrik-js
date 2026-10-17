import { z } from 'zod';

import { idSchema } from '../common/catalog-schemas.js';

/**
 * DTOs del recurso `stock` (Fase 5).
 *
 * `GET /stock/:locationId/movements` acepta un `?materialId=` opcional para
 * filtrar el historial. La forma se valida aquí; la existencia del lugar la
 * comprueba `GetStockMovements` (→ 404).
 */
export const StockMovementsQuerySchema = z.object({
  materialId: idSchema.optional(),
});
export type StockMovementsQuery = z.infer<typeof StockMovementsQuerySchema>;
