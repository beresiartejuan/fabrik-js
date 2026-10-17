# Arquitectura y reglas de dependencia

`@fabrik/domain` es la capa de dominio compartida de Fabrik. Este documento explica
**por qué** está estructurada así; para el detalle de cada API ver
[referencia/](../referencia/value-objects.md) y para las decisiones de producto el
[`docs/02`](../../../../docs/02-modelo-de-dominio.md) y [`docs/07`](../../../../docs/07-arquitectura.md) raíz.

## Regla de oro

Cero dependencias de runtime y cero frameworks. El dominio **no importa** nada de
NestJS, Next.js, Drizzle, Turso ni `node:*`. Solo depende de la librería estándar de
JavaScript/TypeScript. El paquete declara únicamente `typescript` y `vitest` como
`devDependencies`.

Consecuencia práctica: el paquete se consume **compilado** (`package.json` →
`main`/`types` = `./dist/index.js` / `./dist/index.d.ts`, con `exports` apuntando a
`dist/`). Los *imports* relativos del fuente llevan extensión `.js` explícita para que el
ESM emitido resuelva en Node; `build` debe ejecutarse antes que los consumidores (`turbo`
lo encadena vía `dependsOn`). En el monorepo se enlaza con `workspace:*`. La contrapartida
se describe en [decisiones y limitaciones](./decisiones-y-limitaciones.md).

## Capas y orden de dependencia

El barrel público (`src/index.ts`) re-exporta las subcarpetas en orden de dependencia:

```
value-objects → errors → events → entities → ports → use-cases
```

| Capa | Responsabilidad | Puede importar de |
|---|---|---|
| `value-objects/` | IDs branded, `Quantity`, `TimeSlot`, `StockDelta`, `UnitOfMeasure` | `errors` |
| `errors/` | `DomainError` + catálogo de errores tipados | `value-objects` (solo tipos) |
| `events/` | `DomainEvent`, catálogo de eventos + fábricas, `EventBus` | `value-objects` |
| `entities/` | Modelo del negocio, inmutable, con validaciones propias | `value-objects`, `errors` |
| `ports/` | Interfaces de repositorio + `UnitOfWork` + `Repositories` | `entities`, `value-objects` |
| `use-cases/` | Orquestación: una clase por caso de uso | `entities`, `ports`, `events`, `errors`, `value-objects` |

El flujo es unidireccional: los casos de uso conocen las entidades y los puertos, nunca al
revés. Las entidades no conocen repositorios ni eventos. Las flechas del diagrama de
[`docs/07`](../../../../docs/07-arquitectura.md) describen esta misma regla.

## Patrones uniformes

### Entidades inmutables

Toda entidad es inmutable (`Object.freeze`) y sigue el mismo contrato:

- `create(props)` — id autogenerado + validaciones de construcción.
- `fromPersistence(snapshot)` — reconstitución; **vuelve a validar**, lo que habilita el
  *copy-on-write* de las actualizaciones (los casos de uso reconstruyen la entidad con los
  campos cambiados).
- Métodos de transición que devuelven una instancia nueva (`Machine.start()`, `Batch.store()`,
  `Material.deactivate()`, ...).

### Casos de uso

Cada caso de uso es una clase con dependencias inyectadas por constructor y un único
`execute(actor, command)`. No hay contenedor de DI: la API las instancia y les pasa los
puertos. Esto mantiene al dominio agnóstico a NestJS (los adaptadores viven en `apps/api`).

### Eventos después de persistir

Los eventos se publican **después** de persistir el cambio que los originó. En los casos
de uso transaccionales se publican **después del commit**, para no notificar hechos que se
van a revertir. El `EventBus` es una interfaz mínima (`publish`); la API decide la
implementación (in-process al inicio, colas reales luego, sin tocar el dominio).

## Modelo de Actor y roles

La autorización vive en la capa de casos de uso, nunca en las entidades. El contexto de
ejecución es mínimo:

```ts
interface Actor { readonly workerId: WorkerId; readonly role: WorkerRole; }
```

El rol es un dato de identidad del `Worker` (`admin` | `worker` | `auditor`); la API lo
resuelve desde la sesión autenticada y lo pasa explícitamente. El guard compartido
`requireRole` lanza `UnauthorizedRoleError` **antes** de cualquier validación o efecto, de
modo que un rol indebido nunca llega a tocar el dominio.

Constantes de roles:

| Constante | Roles | Uso |
|---|---|---|
| `CATALOG_WRITE_ROLES` | `admin` | Escritura de los catálogos |
| `CATALOG_READ_ROLES` | `admin`, `auditor` | Lectura de los catálogos |
| `ALL_ROLES` | `admin`, `worker`, `auditor` | `GetStockByLocation` (lectura abierta al operario) |

Además, producción y trazabilidad definen arrays locales **no exportados** con la misma
legenda de roles (p. ej. producción A/W, `RecordTransformation` solo `worker`, trazabilidad
A/Au). Ver [referencia/casos-de-uso.md](../referencia/casos-de-uso.md).

Detalle adicional del modelo de roles: [`docs/01`](../../../../docs/01-vision-y-glosario.md).

## Modelo transaccional: `UnitOfWork`

Las operaciones que escriben en varios agregados (por ejemplo `RecordTransformation`:
evento + movimientos de stock + lotes) necesitan atomicidad. El dominio la abstrae con:

```ts
interface UnitOfWork {
  run<T>(fn: (repositories: Repositories) => Promise<T>): Promise<T>;
}
```

Se eligió **inyección de repositorios** en lugar del clásico `begin/commit/rollback`
porque:

- no expone el ciclo de vida de la transacción al caso de uso, que solo ve puertos;
- evita que un `commit` olvidado deje la unidad abierta.

`run` entrega a `fn` un `Repositories` ligado a una transacción abierta: si `fn` resuelve
se confirma; si lanza, se revierte. El adaptador de `apps/api` implementa `run` sobre la
conexión Drizzle; en tests basta una pasada directa (`InMemoryUnitOfWork`).

## Cómo importar

```ts
import { Quantity, Material, type EventBus } from '@fabrik/domain';
```

El barrel re-exporta `value-objects`, `errors`, `events`, `entities`, `ports` y
`use-cases`. Las utilidades de `src/testing/` **no** se re-exportan.
