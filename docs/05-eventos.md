# Eventos de Dominio

Los eventos comunican hechos ocurridos en el dominio. En `packages/domain` se
definen los eventos y una interfaz mínima de bus; cada app decide la
implementación (in-process simple al inicio).

## Contrato base

```ts
interface DomainEvent {
  readonly name: string;          // p.ej. 'batch.transformed'
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}
```

## Catálogo

| Evento | Emisor | Payload | Consumidores típicos |
|---|---|---|---|
| `material.created` / `material.updated` | Create/UpdateMaterial | `materialId` | sync de vistas |
| `machine.created` / `machine.moved` | Create/MoveMachine | `machineId, locationId` | UI |
| `worker.assigned` | AssignWorkerToMachine | `assignmentId, workerId, machineId, slot` | notificaciones, agenda |
| `worker.unassigned` | UnassignWorker | `assignmentId` | agenda |
| `supply.arrived` | RegisterSupplyArrival | `batchId, materialId, quantity, locationId` | dashboards de stock |
| `batch.created` | StartProduction | `batchId, recipeId` | seguimiento de órdenes |
| `batch.transformed` | RecordTransformation | `eventId, machineId, workerId, inputs, outputs, observation?` | **auditoría**, métricas, alertas |
| `batch.stored` | StoreBatch | `batchId, locationId` | stock en vivo |
| `production.completed` | CompleteProduction | `batchId, recipeId` | dashboards, notificación a admin |
| `stock.moved` | cualquier StockMovement | `movementId, locationId, materialId, delta, batchEventId?` | vistas de inventario |

## Notas de diseño

- Los eventos se emiten **después** de persistir el cambio que los originó
  (el use case transacciona primero, luego publica).
- `batch.transformed` es el evento más importante: es la fuente para alertas de
  producción ("sin eventos en máquina X hace N horas"), análisis de mermas y
  paneles del auditor.
- Versión inicial: bus in-process síncrono. La interfaz permite migrar luego a
  colas reales sin tocar el dominio.
