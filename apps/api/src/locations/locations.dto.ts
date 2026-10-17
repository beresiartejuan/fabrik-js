import { z } from 'zod';
import type { Location } from '@fabrik/domain';

import { LOCATION_KINDS } from '../common/catalog-schemas.js';

/** DTOs del recurso `locations` (Fase 4). */

/** `POST /locations`. */
export const CreateLocationSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  kind: z.enum(LOCATION_KINDS),
});
export type CreateLocationDto = z.infer<typeof CreateLocationSchema>;

/**
 * `PATCH /locations/:id`. Solo renombra: `UpdateLocation` no permite cambiar
 * `kind` (violaría I2), así que el schema no lo acepta.
 */
export const UpdateLocationSchema = z.object({
  name: z.string().trim().min(1).optional(),
});
export type UpdateLocationDto = z.infer<typeof UpdateLocationSchema>;

/** `GET /locations` (filtro de `LocationFilter`). */
export const ListLocationsQuerySchema = z.object({
  kind: z.enum(LOCATION_KINDS).optional(),
});
export type ListLocationsQuery = z.infer<typeof ListLocationsQuerySchema>;

export interface LocationResponse {
  readonly id: string;
  readonly name: string;
  readonly kind: Location['kind'];
}

export function serializeLocation(location: Location): LocationResponse {
  return { id: location.id, name: location.name, kind: location.kind };
}
