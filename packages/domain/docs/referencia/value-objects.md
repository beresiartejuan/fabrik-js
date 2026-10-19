# Referencia — Value Objects

Objetos de valor e identidades de `@fabrik/domain`. Todos viven en `src/value-objects/`
y se re-exportan desde el barrel público (`src/index.ts`).

> Reglas de negocio y justificación: ver [explicacion/invariantes.md](../explicacion/invariantes.md)
> y [docs/modelo-de-dominio.md](../../../../docs/modelo-de-dominio.md).

## Identidades (`ids.ts`)

Los IDs son strings *branded*: en runtime son `string`, pero el tipo impide mezclar
identidades de entidades distintas.

```ts
type BrandedId<Name extends string> = string & { readonly [idBrand]: Name };

interface IdFactory<Id extends string> {
  create(): Id;       // UUID v4 nueva
  from(raw: string): Id; // reconstituye desde un valor persistido
}

function createIdFactory<Id extends string>(name: string): IdFactory<Id>;
```

Fábricas exportadas (11):

| Export | Tipo |
|---|---|
| `FactoryId` | `IdFactory<FactoryId>` |
| `WorkerId` | `IdFactory<WorkerId>` |
| `MachineId` | `IdFactory<MachineId>` |
| `MaterialId` | `IdFactory<MaterialId>` |
| `LocationId` | `IdFactory<LocationId>` |
| `RecipeId` | `IdFactory<RecipeId>` |
| `RecipeStepId` | `IdFactory<RecipeStepId>` |
| `BatchId` | `IdFactory<BatchId>` |
| `BatchEventId` | `IdFactory<BatchEventId>` |
| `AssignmentId` | `IdFactory<AssignmentId>` |
| `StockMovementId` | `IdFactory<StockMovementId>` |

Semántica:

- `X.create()` genera un UUID v4 usando `globalThis.crypto.randomUUID()`. Si el
  entorno no expone `crypto.randomUUID`, lanza un `Error` común (no de dominio):
  `crypto.randomUUID no está disponible en este entorno`.
- `X.from(raw)` es una conversión de tipo sin validación en runtime.

## `Quantity` (`quantity.ts`)

Cantidad física inmutable. Invariante: `amount` finito y estrictamente positivo.

```ts
class Quantity {
  readonly amount: number;
  readonly unit: UnitOfMeasure;

  static create(amount: number, unit: UnitOfMeasure): Quantity;
  add(other: Quantity): Quantity;
  subtract(other: Quantity): Quantity;
  equals(other: Quantity): boolean;
  toString(): string; // "12 kg"
}
```

| Método | Regla | Error |
|---|---|---|
| `create` | `Number.isFinite(amount) && amount > 0` | `InvalidQuantityError` |
| `add` | misma unidad que `other` | `InvalidQuantityError` |
| `subtract` | misma unidad **y** resultado `> 0` | `InvalidQuantityError` |
| `equals` | misma unidad y mismo `amount` | — |

Notas:

- La instancia se congela (`Object.freeze`); no hay setters.
- `subtract` **rechaza resultados `<= 0`**. Para comprobar suficiencia de stock (I5)
  hay que comparar los montos crudos (`a.amount >= b.amount`), no usar `subtract`.
  Ver [decisiones y limitaciones](../explicacion/decisiones-y-limitaciones.md).
- En esta fase no hay conversión de unidades: solo se opera entre cantidades de la
  misma unidad.

### Estado físico y unidades

```ts
type PhysicalState = 'solid' | 'liquid' | 'gas';
type UnitOfMeasure = 'g' | 'kg' | 'unit' | 'ml' | 'l' | 'm3';

function isUnitCompatibleWith(unit: UnitOfMeasure, physicalState: PhysicalState): boolean;
function unitsForPhysicalState(physicalState: PhysicalState): readonly UnitOfMeasure[];
```

Tabla de coherencia (I6, `docs/modelo-de-dominio.md`):

| Estado físico | Unidades válidas |
|---|---|
| `solid` | `g`, `kg`, `unit` |
| `liquid` | `ml`, `l` |
| `gas` | `ml`, `l`, `m3` |

## `TimeSlot` (`time-slot.ts`)

Franja horaria semanal inmutable: días + rango `[start, end)` en **hora local**.

```ts
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo (igual que Date.getDay())

class TimeSlot {
  readonly daysOfWeek: readonly DayOfWeek[];
  readonly start: string; // "HH:mm"
  readonly end: string;   // "HH:mm"

  static create(daysOfWeek: readonly DayOfWeek[], start: string, end: string): TimeSlot;
  overlaps(other: TimeSlot): boolean;
  contains(date: Date): boolean;
  equals(other: TimeSlot): boolean;
}
```

| Método | Regla |
|---|---|
| `create` | `daysOfWeek` no vacío, cada día entero en `0..6`, `start`/`end` con formato `HH:mm`, y `start < end` |
| `overlaps` | comparten al menos un día **y** los rangos se intersecan estrictamente; franjas adyacentes (`end === start`) **no** solapan |
| `contains` | el día de `date` está incluido y sus minutos caen en `[start, end)` |
| `equals` | mismo `start`, `end` y misma lista de días en el mismo orden |

Detalles:

- `daysOfWeek` se normaliza: se valida el rango, se deduplica y se ordena ascendente.
- No se soportan rangos que crucen medianoche (`start < end` obligatorio).
- `overlaps`/`contains` usan `Date.getDay()`, `getHours()` y `getMinutes()`, es decir,
  **hora local del proceso** (sin zona horaria explícita). Ver
  [decisiones y limitaciones](../explicacion/decisiones-y-limitaciones.md).
- Cualquier violación en `create` lanza `InvalidTimeSlotError`.

## `StockDelta` (`stock-delta.ts`)

Delta de stock **con signo**. Es una `interface`, no una clase: no valida nada por sí
misma (la validación de no-cero vive en `StockMovement`).

```ts
interface StockDelta {
  readonly amount: number; // positivo = entrada, negativo = salida
  readonly unit: UnitOfMeasure;
}
```

Existencia deliberada: `Quantity` exige `amount > 0`, así que no sirve para
representar salidas. `StockDelta` se comparte con entidades (`StockMovement`) y
eventos (`StockMoved`) sin acoplar capas.
