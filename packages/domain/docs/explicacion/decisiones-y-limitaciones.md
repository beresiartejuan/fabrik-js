# Decisiones de diseño y limitaciones aceptadas

Este documento reúne las decisiones de alcance y los *caveats* conocidos de la capa de
dominio. Cada uno fue contrastado contra el código y sus comentarios. Las reglas de
producto de fondo viven en el `docs/` raíz; aquí se explica cómo se materializan (o no,
todavía) en `packages/domain`.

## Decisiones de diseño

### Inmutabilidad y puertos append-only (I4)

Todas las entidades son inmutables y se congelan (`Object.freeze`). Las transiciones
devuelven instancias nuevas; las actualizaciones se hacen por *copy-on-write* con
`fromPersistence`, que vuelve a validar.

`BatchEvent` y `StockMovement` son los registros históricos del sistema. Por eso sus
puertos son **append-only** (`add`, sin `save`/`delete`): corregir un error consiste en
registrar un hecho compensatorio, nunca en editar el original. Esto da trazabilidad
nativa y hace que la inmutabilidad sea una propiedad estructural, no una convención.

> Matiz: `add` es idempotente por `id` (re-`add` reemplaza), para tolerar reintentos.

### Stock como agregado de movimientos

No existe un campo editable de stock. El stock de un material en un lugar es la suma de
sus `StockMovement`. Se materializa en `StockMovementRepository.sumByLocationAndMaterial`
y, en memoria, en `GetStockByLocation`. Detalle en
[`docs/06`](../../../../docs/06-inventario.md).

### `UnitOfWork` por inyección de repositorios

Se eligió `run(fn(repos))` en lugar de `begin/commit/rollback` para no exponer el ciclo de
vida de la transacción al caso de uso. Razonamiento completo en
[arquitectura y reglas](./arquitectura-y-reglas.md#modelo-transaccional-unitofwork).

### `Material.active` (baja lógica)

`Material` incorpora `active` (default `true`) para habilitar `DeactivateMaterial`. El
`docs/02` raíz no lo menciona; fue una adición de la fase de catálogos para no romper
lecturas/creaciones existentes.

### `UpdateLocation` solo renombra

No se permite cambiar `kind` de un lugar. Hacerlo podría violar I2 (una máquina quedaría
en un lugar que pasa a `storage`) y detectarlo exigiría consultar máquinas por lugar, fuera
del alcance de la fase. La restricción está documentada en el propio caso de uso.

### Receta: compatibilidad entre pasos laxa

`Recipe` valida orden de posiciones e I7, pero **no** valida que el output del paso N sea
input del paso N+1. `docs/02` anticipa explícitamente que esa validación "puede ser laxa"
(los materiales intermedios se crean como `kind: 'product'`).

## Diferimientos y limitaciones

### I5 — Suficiencia de stock: diferido

`InsufficientStockError` existe, pero ningún caso de uso lo lanza todavía.

**Por qué.** `RecordTransformation` debita los consumos en el **lugar de la máquina**,
mientras que los outputs solo ingresan a stock al pasar por `StoreBatch` (`produced`).
Comprobar no-negatividad en el lugar de producción sería incoherente hasta cerrar el flujo
de almacenamiento. Además, los `Batch` son inmutables y no hay contador de consumo parcial,
por lo que tampoco se valida la suficiencia de cantidad por lote. I5 llegará junto al flujo
de almacenamiento completo.

Esto contradice el estado actual de [`docs/04`](../../../../docs/04-casos-de-uso.md), que
lista "hay stock suficiente de los inputs (I5)" como precondición de
`RecordTransformation`, y de [`docs/06`](../../../../docs/06-inventario.md), que afirma que
"el use case valida antes de persistir el movimiento". Hoy es una intención de diseño, no
un comportamiento implementado.

### Sin emisión de `stock.moved`

La interfaz `StockMoved`, su payload y la fábrica `stockMoved` existen y se exportan, pero
**ningún caso de uso los emite** en esta fase. `docs/05` describe `stock.moved` como
emitido por "cualquier `StockMovement`", lo cual no ocurre todavía: los eventos publicados
son los enumerados por caso de uso.

### `TimeSlot` en hora local, sin zona horaria

`TimeSlot.overlaps` y `TimeSlot.contains(date)` usan `Date.getDay()`, `getHours()` y
`getMinutes()`, es decir, la **hora local del proceso**, sin zona horaria explícita ni
`Intl`. Si la API y el front corren en zonas distintas, o si se persisten instantes en
UTC, el cálculo puede diferir. `docs/02`/`docs/04` no fijan una zona.

### Cantidad planificada del lote raíz

`Batch.quantity` es obligatorio y no existe un concepto separado de "cantidad planeada".
`StartProduction` usa `recipe.outputQuantity` como **cantidad objetivo planificada** del
lote raíz, que representa la *orden*, no producto físico. Las cantidades reales viven en
los lotes de output de cada `RecordTransformation`, lo que permite ver mermas al auditar.

### `RecordTransformation`: validaciones que no se hacen

- No valida la **coherencia de unidad de los inputs** (solo la de los outputs).
- No valida **suficiencia de cantidad por lote** (ver I5). El `batchId` de un input debe
  existir, pero nada impide consumirlo más de lo que contiene, ni una segunda vez en
  eventos distintos.

### `GetStockByLocation`: caveats de agregación

- La **unidad** de cada entrada se toma del `unitOfMeasure` del material, no del
  movimiento: pueden convivir movimientos con unidades distintas para el mismo material
  (caveat conocido) y el catálogo es la fuente de verdad (I6).
- Un material con **delta neto 0** se **omite** (no se devuelven entradas en cero).
- Un movimiento que referencia un material inexistente lanza `NotFoundError` (dato
  corrupto), en línea con la convención de no propagar valores vacíos.

### `Quantity`: sin conversión de unidades

Solo se opera entre cantidades de la misma unidad; no hay conversión (`kg` ↔ `g`).
Además, `subtract` rechaza resultados `<= 0`, así que **no sirve** para calcular un stock
que podría quedar en cero o negativo: para eso hay que comparar los montos crudos.

### Trazabilidad: robustez ante datos corruptos

`TraceBatch` y `TraceForward` no hidratan entidades completas (los atributos de máquina,
worker y observación viven en el `BatchEvent` del nodo). Ante datos corruptos:

- referencias colgantes se **ignoran** (se tratan como hoja),
- un **ciclo** corta la rama con `cycleDetected: true` en lugar de colgar.

### `nodenext` / TS2834 al consumir desde `apps/api` — resuelto (Fase 0)

El paquete exponía el fuente (`./src/index.ts`) con *imports* relativos **sin extensión**
(p. ej. `export * from './value-objects'`), lo que bajo `moduleResolution: "nodenext"`
(como en `apps/api`) producía **TS2834** ("Relative import paths need explicit file
extensions..."). **Ya no aplica:** los *imports/exports* relativos del fuente llevan
extensión `.js`/`index.js` explícita y el `exports` map del `package.json` apunta a
`dist/` (`types` → `./dist/index.d.ts`, `default` → `./dist/index.js`). Los consumidores
resuelven el JavaScript declarado, nunca el fuente. `pnpm --filter @fabrik/domain build`
emite `dist/` (los tests quedan excluidos) y `apps/api` compila sin TS2834 ni error de
resolución en runtime. El caveat queda **obsoleto**.

### `testing/` es privado

Los fakes in-memory y `collectingEventBus()` son herramientas para los tests del propio
dominio (y de la API que implemente los puertos). **No** se re-exportan desde el barrel
raíz y pueden cambiar sin aviso. `InMemoryUnitOfWork` no ofrece atomicidad real: ejecuta
`fn` como una pasada directa, sin commit/rollback.

### Otras notas menores

- `createIdFactory(...).create()` lanza un `Error` **común** (no de dominio) si el entorno
  no expone `crypto.randomUUID`.
- Los puertos `MaterialRepository.existsByName` y `BatchRepository.findByMaterial` son
  **opcionales**: los adaptadores que no los soporten pueden omitirlos.
- No hay *aggregates* formales ni *specifications*: DDD a nivel sencillo (ver
  [`docs/01`](../../../../docs/01-vision-y-glosario.md)).
