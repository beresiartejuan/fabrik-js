# Inventario

## Principio

**El stock no es un campo: es un agregado de movimientos.**

No existe `stock.quantity` editable. El stock actual de un material en un lugar
se calcula sumando sus `StockMovement` (`delta` positivo = entrada, negativo =
salida). Esto garantiza trazabilidad nativa: cada unidad presente en un lugar se
puede explicar por los movimientos que la trajeron.

## Modelo

```
StockMovement {
  id, locationId, materialId,
  delta: Quantity,
  reason: 'produced' | 'consumed' | 'transfer_in' | 'transfer_out' | 'manual_adjustment',
  batchEventId?,       // set cuando reason es produced/consumed
  timestamp
}
```

| Reason | Cuándo | batchEventId |
|---|---|---|
| `produced` | Output de un BatchEvent ingresa a almacenamiento | sí |
| `consumed` | Input de un BatchEvent se consume | sí |
| `transfer_in/out` | Movimiento entre lugares (par con signo opuesto) | no |
| `manual_adjustment` | Corrección de conteo físico (solo admin) | no |

```mermaid
flowchart LR
    A[Arrival: +500kg aceite] --> ST[(Stock almacén: 500kg)]
    E1[BatchEvent consume: -200kg] --> ST
    ST --> NOW[Stock actual: 300kg]
    E2[BatchEvent produce: +180kg mezcla] --> ST2[(Stock prod: 180kg)]
```

## Reglas

- **I5**: ninguna salida puede dejar el stock por debajo de cero. El use case
  valida antes de persistir el movimiento.
- Los movimientos son **inmutables** (I4). Corregir = nuevo movimiento
  compensatorio (`manual_adjustment` o un nuevo transfer).
- La trazabilidad stock ↔ producción se da por `batchEventId`: desde un
  movimiento se llega al evento, al trabajador, a la máquina y al lote.
- Fuera de scope (decisión tomada): capacidad máxima de lugares, reservas de
  stock, valoración monetaria.

## Consultas derivadas

- Stock actual por lugar: `SUM(delta) GROUP BY materialId WHERE locationId`.
- Stock global de un material: suma sobre todos los lugares.
- "¿De dónde salió este stock?": movimientos `produced` con sus eventos.
