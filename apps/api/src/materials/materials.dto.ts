import type { Material } from '@fabrik/domain';
import { z } from 'zod';

import { MATERIAL_KINDS, PHYSICAL_STATES, UNITS_OF_MEASURE } from '../common/catalog-schemas.js';

/**
 * DTOs del recurso `materials` (Fase 4). Patrón de la Fase 2: el schema zod es la
 * única fuente del tipo (`z.infer`) y se valida con `ZodValidationPipe`. Los
 * serializadores de respuesta son explícitos por recurso (ver
 * `../common/entity-serializers.ts` para el motivo).
 */

/** `POST /materials`. */
export const CreateMaterialSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  kind: z.enum(MATERIAL_KINDS),
  physicalState: z.enum(PHYSICAL_STATES),
  unitOfMeasure: z.enum(UNITS_OF_MEASURE),
});
export type CreateMaterialDto = z.infer<typeof CreateMaterialSchema>;

/** `PATCH /materials/:id` (todos los campos opcionales; ausente = sin cambio). */
export const UpdateMaterialSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  unitOfMeasure: z.enum(UNITS_OF_MEASURE).optional(),
});
export type UpdateMaterialDto = z.infer<typeof UpdateMaterialSchema>;

/** `GET /materials` (filtros de `MaterialFilter`). */
export const ListMaterialsQuerySchema = z.object({
  kind: z.enum(MATERIAL_KINDS).optional(),
  physicalState: z.enum(PHYSICAL_STATES).optional(),
});
export type ListMaterialsQuery = z.infer<typeof ListMaterialsQuerySchema>;

export interface MaterialResponse {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: Material['kind'];
  readonly physicalState: Material['physicalState'];
  readonly unitOfMeasure: Material['unitOfMeasure'];
  readonly active: boolean;
}

export function serializeMaterial(material: Material): MaterialResponse {
  return {
    id: material.id,
    name: material.name,
    ...(material.description !== undefined ? { description: material.description } : {}),
    kind: material.kind,
    physicalState: material.physicalState,
    unitOfMeasure: material.unitOfMeasure,
    active: material.active,
  };
}
