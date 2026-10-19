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

El paquete **se consume compilado**: el `exports` map apunta a `dist/`
(`types` → `./dist/index.d.ts`, `default` → `./dist/index.js`), y los *imports*
relativos del fuente llevan extensión `.js` explícita para que el ESM emitido
resuelva en Node. En el monorepo se enlaza con `workspace:*`; `build` debe
ejecutarse antes que los consumidores (`turbo` lo encadena vía `dependsOn`).

> **Fase 0 (empaquetado consumible).** Antes el paquete exponía el fuente
> (`./src/index.ts`) con *imports* sin extensión, lo que provocaba **TS2834**
> bajo `moduleResolution: nodenext` (el caso de `apps/api`). Ya no aplica: el
> consumidor resuelve `dist/index.d.ts` / `dist/index.js` y no toca el fuente.

## `testing/` no es API público

Los fakes in-memory y `collectingEventBus()` viven en `src/testing/` y **no**
se re-exportan desde el barrel raíz. Son herramientas para los tests del propio
dominio (y de la API que implemente los puertos), no parte del contrato
público. Pueden cambiar sin aviso.

El *build* emite `dist/testing/`, pero el `exports` map **no** publica el
subpath `./testing`: consumirlo desde otro paquete (`@fabrik/domain/testing`)
**no está soportado** en esta fase. Queda fuera de alcance a propósito; si la
API necesita reutilizar los fakes, se añadirá un subpath explícito más adelante.

## Comandos

```bash
pnpm --filter @fabrik/domain test       # vitest (366 tests)
pnpm --filter @fabrik/domain typecheck  # tsc --noEmit
pnpm --filter @fabrik/domain build      # tsc → dist/
```

## Documentación

- **API del paquete**: [docs/index.md](docs/index.md) — explicación (por qué está
  diseñado así, invariantes, decisiones y limitaciones) y referencia (value objects,
  entidades, errores y eventos, puertos y casos de uso). Solo cubre los exports públicos.
- **Diseño completo (fuente de verdad de las reglas)** en el `docs/` raíz
  ([índice](../../docs/README.md)): visión y glosario
  ([`producto.md`](../../docs/producto.md), [`glosario.md`](../../docs/glosario.md)),
  modelo de dominio ([`modelo-de-dominio.md`](../../docs/modelo-de-dominio.md)), flujo
  de producción ([`flujo-de-produccion.md`](../../docs/flujo-de-produccion.md)),
  inventario ([`inventario.md`](../../docs/inventario.md)), eventos
  ([`eventos.md`](../../docs/eventos.md)) y arquitectura
  ([`arquitectura.md`](../../docs/arquitectura.md)); los casos de uso expuestos por
  HTTP en [`api.md`](../../docs/api.md). El plan de implementación de este paquete hoy
  es este README más la documentación [Diátaxis](docs/index.md).
