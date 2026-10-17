# @fabrik/domain

Capa de **dominio compartida** de Fabrik. Contiene el modelo del negocio
(entidades, value objects, errores, eventos, puertos y casos de uso) que
consumen `apps/api` y `apps/web`.

## Regla de oro

Cero dependencias de runtime y cero frameworks. El dominio **no importa** nada
de NestJS, Next.js, Drizzle, Turso ni `node:*`. Solo depende de la librería
estándar de JavaScript/TypeScript. Los puertos son interfaces que la API
implementa; el dominio nunca conoce la infraestructura.

## Estructura de carpetas

```
src/
  value-objects/   # Quantity, TimeSlot, StockDelta, ids branded
  errors/          # DomainError + catálogo de errores tipados
  events/          # DomainEvent, catálogo + interfaz EventBus
  entities/        # Material, Machine, Worker, Location, Recipe, Batch, ...
  ports/           # interfaces de repositorio + UnitOfWork
  use-cases/       # una clase por caso de uso, con deps inyectadas
  testing/         # fakes in-memory (NO es API público, ver abajo)
  index.ts         # barrel público
```

`src/index.ts` re-exporta únicamente `value-objects`, `errors`, `events`,
`entities`, `ports` y `use-cases`.

## Cómo importar

```ts
import { Quantity, Material, type EventBus } from '@fabrik/domain';
```

El paquete expone directamente el código fuente (`./src/index.ts`); no hay paso
de build para consumirlo. En el monorepo se enlaza con `workspace:*`.

## `testing/` no es API público

Los fakes in-memory y `collectingEventBus()` viven en `src/testing/` y **no**
se re-exportan desde el barrel raíz. Son herramientas para los tests del propio
dominio (y de la API que implemente los puertos), no parte del contrato
público. Pueden cambiar sin aviso.

## Comandos

```bash
pnpm --filter @fabrik/domain test       # vitest (342 tests)
pnpm --filter @fabrik/domain typecheck  # tsc --noEmit
pnpm --filter @fabrik/domain build      # tsc → dist/
```

## Documentación

Diseño completo en `docs/`: modelo y glosario (`01`, `02`), flujo de producción
(`03`), casos de uso (`04`), eventos (`05`), inventario (`06`), arquitectura
(`07`) y el plan de implementación (`08`).
