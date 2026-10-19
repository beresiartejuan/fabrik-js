# Eventos de Dominio

Los eventos de dominio comunican **hechos ya ocurridos**: cada operación que
modifica el estado publica, después de persistir el cambio, un evento
inmutable con nombre, instante y payload congelado. Notifican lo que pasó; no
son órdenes ni comandos.

No hay que confundirlos con los `BatchEvent`: el `BatchEvent` es el **registro
productivo** de una transformación — datos de negocio, consultables, corazón de
la trazabilidad. El evento de dominio es una **notificación efímera** de que
esa u otra operación ocurrió. La transformación genera ambos; el arribo de
suministros o el cierre de una orden solo generan el evento de dominio.

## Catálogo real

Estos son los eventos que el dominio emite hoy, verificados caso de uso por
caso de uso:

| Evento | Lo emite | Payload típico |
|---|---|---|
| `material.created` | Alta de material | `materialId` |
| `material.updated` | Edición o baja lógica de material | `materialId` |
| `machine.created` | Alta de máquina | `machineId`, `locationId` |
| `machine.moved` | Traslado de máquina | `machineId`, `locationId` |
| `worker.assigned` | Asignación de operario a máquina | `assignmentId`, `workerId`, `machineId`, `slot` |
| `worker.unassigned` | Baja de una asignación | `assignmentId` |
| `supply.arrived` | Arribo de suministro | `batchId`, `materialId`, `quantity`, `locationId` |
| `batch.created` | Inicio de orden (lote raíz) | `batchId`, `recipeId` |
| `batch.transformed` | Registro de transformación | `eventId`, `machineId`, `workerId`, `inputs`, `outputs`, `observation?` |
| `batch.stored` | Almacenamiento de un lote | `batchId`, `locationId` |
| `production.completed` | Cierre de la orden | `batchId`, `recipeId` |

Honradez del catálogo, tal como está hoy:

- `stock.moved` está **declarado** en el catálogo tipado del dominio, pero **no
  se emite**: ningún caso de uso lo publica, así que las vistas de inventario
  se calculan a demanda
  ([limitaciones-conocidas.md#stockmoved-no-se-emite](limitaciones-conocidas.md#stockmoved-no-se-emite)).
- Ningún módulo define eventos para lugares, para el ciclo de vida de
  trabajadores ni para recetas: esas operaciones ocurren sin anuncio.
- `batch.transformed` es el evento central de la auditoría: lista la ejecución
  real con actores y mermas.

## Cómo viajan

El contrato del dominio es una interfaz mínima de bus, `publish(evento)`: cada
aplicación decide la implementación, y las entidades y casos de uso no conocen
cómo se entrega el mensaje.

- **En la API** el bus es in-process: acumula los eventos publicados (visible
  para tests) y hoy no tiene suscriptores, así que su efecto de producción es
  ninguno. Cuando haga falta entrega real — colas, webhooks — se reemplaza el
  adaptador sin tocar el dominio.
- **En la demo** el bus es in-memory y su histórico se expone en la interfaz:
  el auditor puede recorrer el feed de eventos de su pestaña (listado completo,
  sin paginar:
  [limitaciones-conocidas.md#eventos-sin-paginación](limitaciones-conocidas.md#eventos-sin-paginación)).

## Lecturas complementarias

- Tipos y payloads exactos de cada evento:
  [errores y eventos, referencia del dominio](../packages/domain/docs/referencia/errores-y-eventos.md).
- [`flujo-de-produccion.md`](flujo-de-produccion.md) — en qué momento del ciclo
  se emite cada evento de producción.
- [`inventario.md`](inventario.md) — movimientos de stock y el evento declarado
  sin emisión.