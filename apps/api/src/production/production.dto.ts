import { z } from 'zod';

import { idSchema, quantitySchema } from '../common/catalog-schemas.js';
import type { BatchEventResponse, BatchResponse } from '../common/entity-serializers.js';

/**
 * DTOs del recurso `production` (Fase 5).
 *
 * Decisión de seguridad (docs/09, tarea 5): `workerId` **no** está en el schema de
 * `RecordTransformation`. El dominio exige `actor.workerId === command.workerId`,
 * así que la API lo inyecta desde el `Actor` autenticado (el controlador), nunca
 * desde el cuerpo: un worker no puede registrar una transformación a nombre de
 * otro. `timestamp` es opcional (ISO 8601) y se convierte a `Date`; permite tests
 * deterministas de la ventana I3.
 *
 * **`timestamp` del cliente (auditoría MEDIA #3).** Aceptar un instante arbitrario
 * permite declarar una transformación fuera de la franja real del worker (I3 se
 * evalúa contra el `timestamp` recibido). Por eso el valor del cuerpo **solo** se
 * usa cuando `FABRIK_ALLOW_CLIENT_TIMESTAMP === 'true'` (tests e2e deterministas);
 * en cualquier otro caso el controlador lo descarta y el dominio aplica
 * `new Date()` en el proceso servidor. El schema sigue validando la forma si el
 * campo viene presente, pero un timestamp descartado no tiene efecto.
 */

/** `POST /production/start`. */
export const StartProductionSchema = z.object({
  recipeId: idSchema,
});
export type StartProductionDto = z.infer<typeof StartProductionSchema>;

/** Input de una transformación: `{ batchId, quantity }`. */
export const TransformationInputSchema = z.object({
  batchId: idSchema,
  quantity: quantitySchema,
});
export type TransformationInputDto = z.infer<typeof TransformationInputSchema>;

/** Output de una transformación: `{ materialId, quantity }`. */
export const TransformationOutputSchema = z.object({
  materialId: idSchema,
  quantity: quantitySchema,
});
export type TransformationOutputDto = z.infer<typeof TransformationOutputSchema>;

/**
 * `POST /production/transform`.
 *
 * La forma se valida aquí; las reglas de negocio (I3 de asignación, máquina no en
 * mantenimiento, I6 de unidades, inputs no vacíos/duplicados) las aplica
 * `RecordTransformation`. El array de `inputs`/`outputs` puede venir vacío: el
 * dominio decide (422 `InvalidTransformationError`) en vez del 400 de zod.
 */
export const RecordTransformationSchema = z.object({
  machineId: idSchema,
  recipeStepId: idSchema.optional(),
  inputs: z.array(TransformationInputSchema),
  outputs: z.array(TransformationOutputSchema),
  observation: z.string().optional(),
  /**
   * Solo se aplica si `FABRIK_ALLOW_CLIENT_TIMESTAMP === 'true'` (ver cabecera);
   * fuera de tests el controlador lo descarta y el dominio usa el reloj servidor.
   */
  timestamp: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
});
export type RecordTransformationDto = z.infer<typeof RecordTransformationSchema>;

/**
 * Indica si la API debe honrar el `timestamp` enviado por el cliente. Apagado por
 * defecto (se usa el reloj del servidor); los e2e lo activan con
 * `FABRIK_ALLOW_CLIENT_TIMESTAMP=true` para fijar la ventana I3. Se lee en cada
 * petición (no al importar el módulo) para que los tests puedan cambiarlo.
 */
export function clientTimestampAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FABRIK_ALLOW_CLIENT_TIMESTAMP === 'true';
}

/** `POST /production/store`. */
export const StoreBatchSchema = z.object({
  batchId: idSchema,
  locationId: idSchema,
});
export type StoreBatchDto = z.infer<typeof StoreBatchSchema>;

/** `POST /production/complete`. */
export const CompleteProductionSchema = z.object({
  batchId: idSchema,
});
export type CompleteProductionDto = z.infer<typeof CompleteProductionSchema>;

/**
 * Respuesta de `POST /production/transform`: el `BatchEvent` creado **y** los lotes
 * de output que generó. El caso de uso devuelve solo el evento (los ids de los
 * lotes de output no viajan en él), así que el controlador los resuelve por
 * `originBatchEventId` para que el cliente pueda encadenar el paso siguiente
 * (p. ej. `store`) sin consultar otra ruta.
 */
export interface TransformationResponse {
  readonly event: BatchEventResponse;
  readonly outputBatches: BatchResponse[];
}
