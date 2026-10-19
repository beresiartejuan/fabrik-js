# Casos de Uso

Convención: cada caso de uso es una función/clase en `packages/domain/use-cases`
que recibe puertos (repositorios) + un comando, y devuelve un resultado o un
error de dominio. La autorización por rol se indica en cada uno.

Leyenda de roles: **A** = admin, **W** = worker, **Au** = auditor (solo lectura).

## Catálogos

| Caso de uso | Roles | Descripción |
|---|---|---|
| `CreateMaterial` / `UpdateMaterial` / `DeactivateMaterial` | A | ABM del catálogo de suministros y productos, con estado físico y unidad |
| `CreateLocation` / `UpdateLocation` | A | ABM de lugares (producción / almacenamiento) |
| `CreateMachine` / `UpdateMachine` / `MoveMachine` | A | ABM de máquinas; `MoveMachine` valida destino kind `production` (I2) |
| `CreateWorker` / `UpdateWorker` / `DeactivateWorker` | A | Gestión de trabajadores y roles. Anti-lockout: un admin no puede cambiarse el rol ni desactivarse; el último admin activo no puede degradarse ni desactivarse |
| `CreateRecipe` / `UpdateRecipe` | A | Define pasos ordenados; valida I7 |
| `GetMaterial/Machine/Worker/Location/Recipe` y listados | A, Au | Lectura |

## Asignaciones

| Caso de uso | Roles | Descripción |
|---|---|---|
| `AssignWorkerToMachine(workerId, machineId, slot)` | A | Crea `Assignment`. **Rechaza si el worker tiene otro assignment con `TimeSlot` solapado** (I1). Una máquina admite múltiples workers |
| `UnassignWorker(assignmentId)` | A | Elimina una asignación |
| `ListMachineSchedule(machineId)` | A, Au | Grilla horaria de la máquina |
| `ListWorkerSchedule(workerId)` | A, Au, W | Grilla horaria del worker. `W` solo puede leer **su propia** agenda (`actor.workerId === command.workerId`); si pide la de otro → `UnauthorizedRoleError` (403) |

## Producción

| Caso de uso | Roles | Descripción |
|---|---|---|
| `RegisterSupplyArrival(materialId, quantity, locationId)` | A, W | Crea `Batch` de suministro + `StockMovement` de entrada |
| `StartProduction(recipeId)` | A | Crea el lote raíz `in_progress`. Emite `BatchCreated` |
| `RecordTransformation(command)` | W | Núcleo operativo. Ver detalle abajo |
| `StoreBatch(batchId, locationId)` | A, W | Mueve un lote a almacenamiento (`StockMovement`) |
| `CompleteProduction(batchId)` | A, W | Marca el lote como `completed`. Emite `ProductionCompleted` |

### `RecordTransformation` (detalle)

**Precondiciones:**
- El worker tiene asignación vigente a la máquina en el horario actual (I3). La
  franja se evalúa en la **zona local del servidor**; los clientes usan
  `activeNow` de `GET /me/schedule` en vez de recalcularla.
- La máquina está en estado operativo.
- Si se envía `recipeStepId` y algún lote de input aporta `recipeId`, el paso debe
  existir en esa receta y `machine.type` debe coincidir con `step.machineType`
  (`MachineTypeMismatchError`). En transformaciones ad-hoc (sin `recipeId` en los
  inputs) esta validación se omite.
- **I5 (diferida):** la suficiencia de stock de los inputs **no se valida todavía**.
  Se decidió posponerla porque el consumo se descuenta en el lugar de la máquina y
  los outputs solo ingresan a stock en `StoreBatch`; ver `docs/06-inventario.md`.

**Entrada:**
```
{ machineId, workerId, recipeStepId?,
  inputs: [{ batchId, quantity }],
  outputs: [{ materialId, quantity }],
  observation?: string, timestamp? }
```

`timestamp` existe en el comando de dominio para tests deterministas, pero la API
**lo ignora** y usa el reloj del servidor salvo que `FABRIK_ALLOW_CLIENT_TIMESTAMP=true`
(solo e2e). I3 se evalúa con el instante resultante.

**Efectos (transaccionales):**
1. Crea el `BatchEvent` inmutable.
2. Por cada input: `StockMovement` de salida vinculado al evento.
3. Por cada output: crea `Batch` con `originBatchEventId` = evento.
4. Emite `BatchTransformed`.

## Trazabilidad y consulta

| Caso de uso | Roles | Descripción |
|---|---|---|
| `TraceBatch(batchId)` | A, Au | Árbol completo hacia atrás (genealogía) con eventos, máquinas, workers y observaciones |
| `TraceForward(batchId)` | A, Au | Genealogía hacia adelante: qué productos derivan de este lote (recalls) |
| `GetStockByLocation(locationId)` | A, Au, W | Stock actual por material (agregado de movimientos) |
| `GetStockMovements(locationId, materialId)` | A, Au | Historial de movimientos |
| `ListBatchEvents(filters)` | A, Au | Búsqueda por máquina, worker, fecha, material |

## Errores de dominio

`OverlappingScheduleError`, `InsufficientStockError`, `WorkerNotAssignedError`,
`InactiveMachineError`, `InvalidQuantityError`, `RecipeIntegrityError`,
`UnauthorizedRoleError`, `SelfModificationNotAllowedError`,
`LastAdminError`, `MachineTypeMismatchError`.

- `SelfModificationNotAllowedError`: un admin no puede cambiar su propio rol ni
  desactivarse.
- `LastAdminError`: el último admin activo no puede degradarse ni desactivarse.
  **Hoy es inalcanzable por HTTP**: la autoprotección (`SelfModificationNotAllowedError`)
  bloquea antes el camino; queda como guarda de dominio para futuros flujos.
- `MachineTypeMismatchError`: el paso de receta no corresponde al tipo de máquina.
