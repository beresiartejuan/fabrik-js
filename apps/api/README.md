# fabrik-api

API HTTP (NestJS) del monorepo `fabrik-js`. Cada fase del plan
(`docs/09-plan-de-api.md`) documenta sus decisiones en el README de su módulo:
[`src/persistence/README.md`](./src/persistence/README.md),
[`src/domain/README.md`](./src/domain/README.md) y
[`src/auth/README.md`](./src/auth/README.md).

## Persistencia (Fase 1)

La capa de persistencia (Drizzle + Turso/SQLite) implementa los 9 puertos de
repositorio de `@fabrik/domain` y `UnitOfWork`. Detalle de la **elección de
cliente**, layout, decisiones de esquema y comandos en
[`src/persistence/README.md`](./src/persistence/README.md).

- Cliente elegido: **`@tursodatabase/database`** (SDK actual del motor Turso) con
  el driver `drizzle-orm/tursodatabase/database` de **Drizzle v1.0 RC** (el
  Drizzle estable solo soporta el SDK anterior `@libsql/client`).
- Base local por env var `FABRIK_DB_FILE` (default `./data/fabrik.db`).
- Migraciones: `pnpm --filter api db:generate` y `pnpm --filter api db:migrate`.

## Dominio (Fase 2)

El `DomainModule` (`src/domain/`) cablea los 9 puertos a sus adaptadores Drizzle y
registra los **37 casos de uso** del dominio como providers (un factory explícito
por caso de uso, sin reflexión). Detalle del patrón, tokens de DI, filtro de
errores y validación en [`src/domain/README.md`](./src/domain/README.md).

- `EventBus` in-process (`InMemoryEventBus`); en producción es no-op salvo por el
  histórico que usan los tests.
- `DomainExceptionFilter` global (`APP_FILTER`): `DomainError → HTTP` según la
  tabla de `docs/09-plan-de-api.md`, fallback 500.
- Validación con **zod** (`ZodValidationPipe`): schemas compartibles con
  `apps/web` y tipos inferidos; decisión documentada frente a `class-validator`.
- Health check: `GET /health` → `{ ok: true }`.

## Auth (Fase 3)

La autenticación vive **solo** en `apps/api/src/auth/` y se guarda por `workerId`
(el `Worker` del dominio no tiene password). Detalle de decisiones en
[`src/auth/README.md`](./src/auth/README.md).

- Contraseñas con **scrypt** (`node:crypto`, sal por usuario, `timingSafeEqual`).
- **JWT manual** HMAC-SHA256 (`header.payload.signature`, base64url), sin
  `jsonwebtoken`: access ~15 min + refresh rotativo ~30 días. El refresh se
  persiste **hasheado** (SHA-256) en `refresh_tokens`; al rotar se revoca el viejo.
- `ActorGuard` global con `@Public()`: valida el access token y **recarga el
  worker** (rol fresco, debe estar activo). `@Actor()` inyecta el `Actor`. El guard
  autentica (401); la autorización por rol es del dominio (403).
- Endpoints: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `GET /auth/me`.
- Tablas `auth_credentials` y `refresh_tokens` (migración en `apps/api/drizzle/`).

### Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | fuera de tests | — | Secreto HMAC del access token. |
| `JWT_REFRESH_SECRET` | fuera de tests | — | Secreto HMAC del refresh token. |
| `JWT_ACCESS_TTL_SECONDS` | no | `900` | Vida del access token. |
| `JWT_REFRESH_TTL_SECONDS` | no | `2592000` | Vida del refresh token. |
| `BOOTSTRAP_ADMIN_NAME` | no | — | Crea un admin al arrancar si no existe. |
| `BOOTSTRAP_ADMIN_PASSWORD` | no | — | Contraseña de ese admin (junto con la anterior). |
| `FABRIK_DB_FILE` | no | `./data/fabrik.db` | Archivo SQLite. |

## Catálogos y asignaciones (Fase 4)

Un módulo por recurso (`src/materials/`, `locations/`, `machines/`, `workers/`,
`recipes/`, `assignments/`): `*.controller.ts` + `*.dto.ts` (schema zod y tipo
`z.infer` + serializador explícito) + `*.module.ts`. Todos importan `DomainModule`
y **no reimplementan RBAC**: inyectan el `Actor` y el caso de uso aplica
`requireRole` (`admin` escribe; `admin`/`auditor` leen) → `UnauthorizedRoleError`
→ 403 por el filtro global.

- La baja de material/worker es lógica (`POST :id/deactivate`, idempotente); la
  desasignación sí borra (`DELETE /assignments/:id` → 204).
- `workers` solo expone `deactivate` (el dominio no tiene caso de uso de
  reactivación).
- `recipes` usa `PATCH`; enviar `steps` reemplaza la lista completa.
- `TimeSlot` en el wire: `{ daysOfWeek: number[] (0=domingo…6=sábado), start, end }`
  con horas `HH:mm`; `TimeSlot.create` normaliza días y valida el rango (422).
- Filtros de listado: `?kind=`, `?physicalState=`, `?locationId=`, `?status=`,
  `?type=`, `?role=`, `?active=true|false`, `?outputProductId=`.

| Método y ruta | Caso de uso |
|---|---|
| `POST /materials` · `GET /materials` · `GET /materials/:id` · `PATCH /materials/:id` · `POST /materials/:id/deactivate` | `CreateMaterial` · `ListMaterials` · `GetMaterial` · `UpdateMaterial` · `DeactivateMaterial` |
| `POST /locations` · `GET /locations` · `GET /locations/:id` · `PATCH /locations/:id` | `CreateLocation` · `ListLocations` · `GetLocation` · `UpdateLocation` |
| `POST /machines` · `GET /machines` · `GET /machines/:id` · `PATCH /machines/:id` · `POST /machines/:id/move` | `CreateMachine` · `ListMachines` · `GetMachine` · `UpdateMachine` · `MoveMachine` |
| `POST /workers` · `GET /workers` · `GET /workers/:id` · `PATCH /workers/:id` · `POST /workers/:id/deactivate` | `CreateWorker` · `ListWorkers` · `GetWorker` · `UpdateWorker` · `DeactivateWorker` |
| `POST /recipes` · `GET /recipes` · `GET /recipes/:id` · `PATCH /recipes/:id` | `CreateRecipe` · `ListRecipes` · `GetRecipe` · `UpdateRecipe` |
| `POST /assignments` · `DELETE /assignments/:id` · `GET /workers/:id/schedule` · `GET /machines/:id/schedule` | `AssignWorkerToMachine` · `UnassignWorker` · `ListWorkerSchedule` · `ListMachineSchedule` |

E2E: `apps/api/test/{materials,locations,machines,workers,recipes,assignments}/*.e2e-spec.ts`
sobre el helper compartido `test/support/e2e-app.ts` (base temporal, admin por env y
siembra de `worker`/`auditor`).

## Producción e inventario (Fase 5)

Tres módulos siguiendo el patrón de la Fase 4: `src/supplies/`, `src/production/` y
`src/stock/`. El RBAC sigue en el dominio (`UnauthorizedRoleError` → 403):
`StartProduction` es solo `admin`, `RecordTransformation` solo `worker`, y
`StoreBatch`/`CompleteProduction`/`RegisterSupplyArrival` son `admin`/`worker`.

- **`workerId` del `Actor`, nunca del cuerpo.** `POST /production/transform` no acepta
  `workerId`; el controlador inyecta `actor.workerId` (el dominio exige que coincidan).
- **`timestamp` opcional** (ISO 8601 → `Date`) en `transform`, para tests
  deterministas de la ventana I3.
- **`transform` devuelve el evento y los lotes de output** (el caso de uso solo
  devuelve el `BatchEvent`; el controlador resuelve los outputs por
  `originBatchEventId`). `start`/`transform` responden **201**; `store`/`complete`, **200**.
- **Serializadores compartidos**: `Batch`, `BatchEvent` y `StockMovement` en
  `src/common/entity-serializers.ts` (lista blanca; `Date` → ISO 8601).
- **Stock**: `GET /stock/:locationId` es A/Au/**W** (el operario lee existencias);
  `GET /stock/:locationId/movements` es A/Au. El lugar de la máquina puede mostrar
  `amount` negativo tras un consumo.

| Método y ruta | Caso de uso |
|---|---|
| `POST /supplies/arrivals` | `RegisterSupplyArrival` |
| `POST /production/start` · `POST /production/transform` · `POST /production/store` · `POST /production/complete` | `StartProduction` · `RecordTransformation` · `StoreBatch` · `CompleteProduction` |
| `GET /stock/:locationId` · `GET /stock/:locationId/movements` | `GetStockByLocation` · `GetStockMovements` |

E2E: `apps/api/test/production/production.e2e-spec.ts` (flujo completo con merma +
RBAC + errores del camino) y `apps/api/test/stock/stock.e2e-spec.ts`.

## Comandos

```bash
$ pnpm --filter api start:dev      # desarrollo (watch)
$ pnpm --filter api build          # compilación (nest build)
$ pnpm --filter api lint           # oxlint (src/ y test/)
$ pnpm --filter api test           # unitarios (vitest)
$ pnpm --filter api test:e2e       # e2e (supertest sobre SQLite temporal)
$ pnpm --filter api db:generate    # drizzle-kit generate (migraciones)
$ pnpm --filter api db:migrate     # aplicar migraciones
```
