import type { DayOfWeek } from '@fabrik/domain';
import { z } from 'zod';

/**
 * Piezas de validación compartidas por los DTOs de catálogo (Fase 4, docs/09).
 *
 * Los tipos del dominio (`MaterialKind`, `PhysicalState`, `UnitOfMeasure`, …) no
 * existen en runtime, así que sus valores literales se enumeran **una sola vez**
 * aquí y se reutilizan en todos los schemas zod. Si el dominio añade una unidad o
 * un tipo, este es el único punto de la API que hay que tocar.
 */

export const MATERIAL_KINDS = ['supply', 'product'] as const;
export const PHYSICAL_STATES = ['solid', 'liquid', 'gas'] as const;
export const UNITS_OF_MEASURE = ['g', 'kg', 'unit', 'ml', 'l', 'm3'] as const;
export const LOCATION_KINDS = ['production', 'storage'] as const;
export const MACHINE_STATUSES = ['idle', 'running', 'maintenance'] as const;
export const WORKER_ROLES = ['admin', 'worker', 'auditor'] as const;

/**
 * Identificador. En el wire es un string; el dominio lo revalida con
 * `MaterialId.from(...)` (branded id). Solo se comprueba que no venga vacío.
 */
export const idSchema = z.string().trim().min(1);

/**
 * Cantidad física `{ amount, unit }`. La **forma** se valida aquí y el invariante
 * (`amount` finito y > 0) lo valida `Quantity.create`, que lanza
 * `InvalidQuantityError` → 422 vía `DomainExceptionFilter`.
 */
export const quantitySchema = z.object({
  amount: z.number(),
  unit: z.enum(UNITS_OF_MEASURE),
});

/**
 * Franja horaria (**wire format**): `daysOfWeek` (0 = domingo … 6 = sábado, igual
 * que `Date.getDay()`) + `start`/`end` en `HH:mm`.
 *
 * Aquí solo se valida la forma (días enteros en rango y horas como string); la
 * **normalización** (deduplicar/ordenar días), el formato `HH:mm` y la regla
 * `start < end` los aplica `TimeSlot.create`, que lanza `InvalidTimeSlotError`
 * → 422. Así el contrato del wire no duplica la lógica de la VO.
 */
export const timeSlotSchema = z.object({
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .transform((days) => days as DayOfWeek[]),
  start: z.string(),
  end: z.string(),
});

/**
 * Query booleana (`?active=true`). No se usa `z.coerce.boolean()` porque en JS
 * cualquier string no vacío —incluido `"false"`— es *truthy*; aquí solo `"true"`
 * y `"false"` son válidos y se traducen al booleano correcto.
 */
export const booleanQuerySchema = z
  .union([z.literal('true'), z.literal('false')])
  .transform((value) => value === 'true');
