import { z } from 'zod';

import { idSchema, quantitySchema } from '../common/catalog-schemas.js';

/**
 * DTOs del recurso `supplies` (Fase 5).
 *
 * `POST /supplies/arrivals` solo define la forma: el material debe ser de tipo
 * `supply`, el lugar `storage` y la unidad coincidir con la del material. Esas
 * reglas las aplica `RegisterSupplyArrival` (→ 404/422 vía el filtro global), no
 * el schema. La respuesta es un `BatchResponse` (`../common/entity-serializers.ts`),
 * porque el ingreso crea un lote ya en estado `stored`.
 */

/** `POST /supplies/arrivals`. */
export const RegisterSupplyArrivalSchema = z.object({
  materialId: idSchema,
  quantity: quantitySchema,
  locationId: idSchema,
});
export type RegisterSupplyArrivalDto = z.infer<typeof RegisterSupplyArrivalSchema>;
