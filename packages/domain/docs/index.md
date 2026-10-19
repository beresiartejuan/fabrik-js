# Documentación de `@fabrik/domain`

Esta carpeta documenta la **API de la implementación** del paquete `@fabrik/domain`
(capa de dominio compartida) siguiendo el marco [Diátaxis](https://diataxis.fr/):

- **Explicación** (`explicacion/`) — orientada a entendimiento: por qué el paquete está
  diseñado así, las reglas de dependencia, los invariantes y las decisiones/limitaciones.
- **Referencia** (`referencia/`) — orientada a información: descripción técnica
  estructurada de la superficie pública (value objects, entidades, errores, eventos,
  puertos y casos de uso).

## Relación con el `docs/` raíz

Los documentos raíz (en [`docs/`](../../../docs/README.md)) son la **fuente de verdad
de las reglas y decisiones de producto/diseño**: producto y glosario, modelo de
dominio, flujo de producción, casos de uso, eventos, inventario, arquitectura, API
y limitaciones conocidas.

Estas páginas no repiten esas reglas: explican **cómo se materializan en el código** y
enlazan al documento raíz correspondiente cuando corresponde. Si hay discrepancia entre
estas páginas y el código, manda el código; si hay discrepancia sobre reglas, manda el
`docs/` raíz (y conviene revisarlo). Los desajustes detectados están señalados en
[decisiones y limitaciones](./explicacion/decisiones-y-limitaciones.md).

## Explicación

| Documento | Contenido |
|---|---|
| [Arquitectura y reglas de dependencia](./explicacion/arquitectura-y-reglas.md) | Regla de oro, capas, patrones uniformes, modelo de `Actor`/roles, `UnitOfWork` |
| [Invariantes y dónde se aplican](./explicacion/invariantes.md) | I1–I7: en qué archivo/método se hace cumplir cada uno y con qué error |
| [Decisiones de diseño y limitaciones](./explicacion/decisiones-y-limitaciones.md) | Deferimientos (I5, `stock.moved`), *caveats* (zona horaria), semánticas aceptadas; empaquetado `dist` (TS2834 resuelto en Fase 0) |

## Referencia

| Documento | Contenido |
|---|---|
| [Value objects](./referencia/value-objects.md) | IDs branded, `Quantity`, unidades, `TimeSlot`, `StockDelta` |
| [Entidades](./referencia/entidades.md) | Campos, factories y métodos de ciclo de vida de cada entidad |
| [Errores y eventos](./referencia/errores-y-eventos.md) | Catálogo de errores tipados y de eventos (nombre → payload) |
| [Puertos](./referencia/puertos.md) | 9 repositorios + `UnitOfWork` + `Repositories`, con semánticas |
| [Casos de uso](./referencia/casos-de-uso.md) | Clase → roles → deps → comando → errores → eventos |

## Alcance de la API pública

Esta documentación describe **solo lo exportado por `src/index.ts`**: `value-objects`,
`errors`, `events`, `entities`, `ports` y `use-cases`.

`src/testing/` (fakes in-memory, `collectingEventBus()`, `InMemoryUnitOfWork`) existe en el
repositorio pero **no es API pública**: puede cambiar sin aviso. Se menciona únicamente a
los efectos de escribir tests.

## Uso rápido

```ts
import { Quantity, Material, type EventBus } from '@fabrik/domain';
```

El paquete se consume **compilado** (`dist/`, con `.js` + `.d.ts`) y no tiene
dependencias de runtime. Ver el [README del paquete](../README.md) para estructura,
comandos y la regla de cero dependencias.
