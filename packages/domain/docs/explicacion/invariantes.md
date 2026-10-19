# Invariantes y dónde se aplican

Los invariantes I1–I7 están definidos en [`docs/modelo-de-dominio.md`](../../../../docs/modelo-de-dominio.md)
(fuente de verdad de las reglas). Aquí se documenta **dónde los hace cumplir el código**,
con el archivo y el punto exacto.

Principio de diseño: cada invariante se aplica **en el nivel más bajo posible**. Una
entidad garantiza lo que puede comprobar por sí misma; lo que requiere varios agregados
(consultar repositorios) se aplica en el caso de uso.

## Resumen

| # | Invariante | Dónde se aplica | Error |
|---|---|---|---|
| I1 | Dos `Assignment` del mismo worker no pueden solapar (`TimeSlot`) | `AssignWorkerToMachine` (+ helper `TimeSlot.overlaps`) | `OverlappingScheduleError` |
| I2 | Una `Machine` solo puede ubicarse en un `Location` `production` | `Machine.moveTo`, `CreateMachine`, `MoveMachine` | `InvalidLocationKindError` |
| I3 | Un `BatchEvent` solo lo registra un worker con asignación vigente a esa máquina | `RecordTransformation` (`slot.contains(timestamp)`) | `WorkerNotAssignedError` |
| I4 | `BatchEvent` y `StockMovement` son inmutables | Constructores (`Object.freeze`) + puertos append-only | — (imposible mutar) |
| I5 | El stock nunca queda negativo (una salida exige stock suficiente) | **Diferido** — no se aplica todavía | `InsufficientStockError` (definido, sin lanzar) |
| I6 | Las `Quantity` son coherentes con la unidad del material | `Material.build`, `RegisterSupplyArrival`, `RecordTransformation` | `IncompatibleUnitError` |
| I7 | El output de la receta coincide con el de su último paso | `Recipe.validateSteps` | `RecipeIntegrityError` |

## Detalle

### I1 — Solapamiento de asignaciones

En [`AssignWorkerToMachine`](../../src/use-cases/assignment-use-cases.ts) se cargan las
asignaciones del worker (`assignments.findByWorker`) y se busca una cuyo
`slot.overlaps(command.slot)` sea verdadero; si existe, se lanza
`OverlappingScheduleError(workerId, conflicting.id)`.

El helper puro es `TimeSlot.overlaps` (y su envoltorio `Assignment.overlapsWith`). Franjas
adyacentes (`end === start`) **no** solapan. El invariante aplica al mismo worker sin
importar la máquina.

### I2 — Ubicación de máquinas

Doble aplicación:

- `Machine.moveTo(location)` lanza `InvalidLocationKindError` si `location.kind !== 'production'`.
- `CreateMachine` y `MoveMachine` validan que el lugar exista (`NotFoundError`) y sea
  `production` antes de instanciar/mover.

El error también se reutiliza con `expected` para exigir `storage` en
`RegisterSupplyArrival` y `StoreBatch` (lugares de almacenamiento).

### I3 — Asignación vigente del worker

En `RecordTransformation` se cargan las asignaciones del worker y se comprueba que exista
una con `assignment.machineId === machine.id` y `assignment.slot.contains(timestamp)`. Si
no, se lanza `WorkerNotAssignedError(worker.id, machine.id, timestamp)`. `TimeSlot.contains`
evalúa día + rango `[start, end)`.

### I4 — Inmutabilidad

- `BatchEvent` y `StockMovement` congelan la instancia y sus colecciones
  (`Object.freeze`) y no exponen setters ni métodos de mutación.
- Sus puertos son **append-only**: `add` (sin `save`/`delete`). Corregir un error implica
  registrar un hecho compensatorio, nunca editar el original.
- La inmutabilidad es también la razón de que `save` (upsert) exista solo para las
  entidades mutables por copy-on-write.

Ver [decisiones y limitaciones](./decisiones-y-limitaciones.md) para el razonamiento.

### I5 — Stock suficiente (diferido)

`InsufficientStockError` existe con contexto tipado, pero **ningún caso de uso lo lanza**
todavía. El motivo y el alcance del diferimiento se explican en
[decisiones y limitaciones](./decisiones-y-limitaciones.md).

### I6 — Coherencia de unidades

- `Material.build` valida que `unitOfMeasure` sea coherente con `physicalState`
  (`isUnitCompatibleWith`).
- `RegisterSupplyArrival` valida que la cantidad use la unidad del material.
- `RecordTransformation` valida la unidad de **cada output** contra el material.
- `GetStockByLocation` toma la unidad del `Material` (fuente de verdad, I6), no del
  movimiento.

`StockMovement` y `BatchEvent` **no** validan la coherencia contra el material en su
constructor (no tienen acceso a un repositorio); esa comprobación la hace el caso de uso
que los crea. `RecordTransformation` **no** valida la coherencia de unidad de los inputs
(ver limitaciones).

### I7 — Integridad de la receta

`Recipe.validateSteps` (invocado por `create`/`fromPersistence`) exige:

1. al menos un paso;
2. posiciones consecutivas empezando en 1 (tras ordenar por `position`);
3. que el `outputProductId` del último paso coincida con el de la receta.

Cualquier incumplimiento lanza `RecipeIntegrityError(recipeId, reason)`.

Para más contexto de flujo, ver [`docs/flujo-de-produccion.md`](../../../../docs/flujo-de-produccion.md).
