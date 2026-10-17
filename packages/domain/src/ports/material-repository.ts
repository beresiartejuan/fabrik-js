import type { Material, MaterialKind } from '../entities/material.js';
import type { MaterialId } from '../value-objects/ids.js';
import type { PhysicalState } from '../value-objects/quantity.js';

// Filtro explícito y pequeño para `list` (todos los campos son opcionales:
// ausente = sin restricción).
export interface MaterialFilter {
  readonly kind?: MaterialKind;
  readonly physicalState?: PhysicalState;
}

/**
 * Persistencia del catálogo de materiales (docs/04, `CreateMaterial`/`UpdateMaterial`).
 *
 * Convención de `save`: upsert por `id` (inserta si no existe, reemplaza si ya
 * existe). `findById` devuelve `null` cuando no hay coincidencia.
 */
export interface MaterialRepository {
  findById(id: MaterialId): Promise<Material | null>;
  list(filter?: MaterialFilter): Promise<readonly Material[]>;
  save(material: Material): Promise<void>;
  /** Chequeo de unicidad de nombre, opcional para adaptadores que no lo soporten. */
  existsByName?(name: string): Promise<boolean>;
}
