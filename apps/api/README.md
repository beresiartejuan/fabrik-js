# fabrik-api

API HTTP del monorepo `fabrik-js` (NestJS 12, ESM, Drizzle + Turso/SQLite, zod).
Expone los casos de uso de `@fabrik/domain` sobre **45 rutas**; la autorización por
rol (`admin`/`worker`/`auditor`) la decide el dominio (`403`).

- Plan y decisiones globales: [`docs/09-plan-de-api.md`](../../docs/09-plan-de-api.md).
- READMEs por módulo: [`src/persistence`](./src/persistence/README.md),
  [`src/domain`](./src/domain/README.md), [`src/auth`](./src/auth/README.md),
  [`src/openapi`](./src/openapi/README.md).

## Arranque rápido

```bash
$ pnpm install                              # desde la raíz del monorepo
$ cp apps/api/.env.example apps/api/.env     # secretos y DB de desarrollo
$ pnpm --filter api db:migrate              # aplica las migraciones sobre FABRIK_DB_FILE
$ pnpm --filter api db:seed                 # siembra la demo (idempotente)
$ pnpm --filter api start:dev               # watch en http://localhost:3001
```

`main.ts`, `db:migrate` y `db:seed` cargan `.env` (si existe) con la API nativa de
Node (`process.loadEnvFile`, sin `dotenv`); las variables ya exportadas en el
entorno tienen prioridad. Los secretos de `.env.example` son de desarrollo:
cámbialos antes de desplegar.

Con la API arriba: `GET /health` → `{ ok: true }` y la documentación interactiva en
`http://localhost:3001/docs` (JSON en `/docs-json`).

La **auth** necesita secretos (siguiente tabla); el **seed** crea tres usuarios de
demo: `admin`/`admin123`, `operario`/`operario123`, `auditor`/`auditor123`. El
`BOOTSTRAP_ADMIN_*` **crea** un admin al arrancar solo si no existe (nunca
actualiza rol ni contraseña de uno existente); es útil para e2e/desarrollo.

## Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | sí (fuera de tests) | — | Secreto HMAC del access token. Si falta, el arranque falla en claro. |
| `JWT_REFRESH_SECRET` | sí (fuera de tests) | — | Secreto HMAC del refresh token. |
| `JWT_ACCESS_TTL_SECONDS` | no | `900` (15 min) | Vida del access token. |
| `JWT_REFRESH_TTL_SECONDS` | no | `2592000` (30 días) | Vida del refresh token. |
| `BOOTSTRAP_ADMIN_NAME` | no | — | Crea un admin al arrancar si no existe (junto con la contraseña). |
| `BOOTSTRAP_ADMIN_PASSWORD` | no | — | Contraseña de ese admin. |
| `FABRIK_DB_FILE` | no | `./data/fabrik.db` | Archivo SQLite local (relativo al cwd, normalmente `apps/api`). |
| `PORT` | no | `3001` | Puerto HTTP. |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Orígenes permitidos por CORS (lista separada por comas). Sin credenciales (Bearer, sin cookies). En producción hay que definirla. |
| `FABRIK_ALLOW_CLIENT_TIMESTAMP` | no | apagado | Solo `true` (exacto) hace que `POST /production/transform` use el `timestamp` del cuerpo. Apagado, el timestamp se descarta y se usa el reloj del servidor (I3). Pensado para e2e; no lo actives en producción. |

Detalle de auth en [`src/auth/README.md`](./src/auth/README.md); el resto de
variables (tests) las inyecta Vitest automáticamente.

## Endpoints

Todas las rutas salvo las **públicas** (`GET /health`, `POST /auth/login`,
`POST /auth/refresh`) exigen `Authorization: Bearer <access token>`; sin token o con
token inválido/vencido → `401`. La autorización por rol vive en el dominio
(`UnauthorizedRoleError` → `403`), no en los controladores.

| Recurso | Método y ruta | Caso de uso |
|---|---|---|
| health | `GET /health` (público) | — |
| auth | `POST /auth/login` (público) | `AuthService.login` |
| auth | `POST /auth/refresh` (público) | `AuthService.refresh` |
| auth | `POST /auth/logout` | `AuthService.logout` |
| auth | `GET /auth/me` | — (smoke del guard) |
| materials | `POST /materials` | `CreateMaterial` |
| materials | `GET /materials` | `ListMaterials` |
| materials | `GET /materials/:id` | `GetMaterial` |
| materials | `PATCH /materials/:id` | `UpdateMaterial` |
| materials | `POST /materials/:id/deactivate` | `DeactivateMaterial` |
| locations | `POST /locations` | `CreateLocation` |
| locations | `GET /locations` | `ListLocations` |
| locations | `GET /locations/:id` | `GetLocation` |
| locations | `PATCH /locations/:id` | `UpdateLocation` |
| machines | `POST /machines` | `CreateMachine` |
| machines | `GET /machines` | `ListMachines` |
| machines | `GET /machines/:id` | `GetMachine` |
| machines | `PATCH /machines/:id` | `UpdateMachine` |
| machines | `POST /machines/:id/move` | `MoveMachine` |
| workers | `POST /workers` | `CreateWorker` |
| workers | `GET /workers` | `ListWorkers` |
| workers | `GET /workers/:id` | `GetWorker` |
| workers | `PATCH /workers/:id` | `UpdateWorker` |
| workers | `POST /workers/:id/deactivate` | `DeactivateWorker` |
| recipes | `POST /recipes` | `CreateRecipe` |
| recipes | `GET /recipes` | `ListRecipes` |
| recipes | `GET /recipes/:id` | `GetRecipe` |
| recipes | `PATCH /recipes/:id` | `UpdateRecipe` |
| assignments | `POST /assignments` | `AssignWorkerToMachine` |
| assignments | `DELETE /assignments/:id` | `UnassignWorker` |
| assignments | `GET /workers/:id/schedule` | `ListWorkerSchedule` |
| assignments | `GET /machines/:id/schedule` | `ListMachineSchedule` |
| me | `GET /me/schedule` | `ListWorkerSchedule` + `activeNow` server-side |
| supplies | `POST /supplies/arrivals` | `RegisterSupplyArrival` |
| production | `POST /production/start` | `StartProduction` |
| production | `POST /production/transform` | `RecordTransformation` |
| production | `POST /production/store` | `StoreBatch` |
| production | `POST /production/complete` | `CompleteProduction` |
| stock | `GET /stock/:locationId` | `GetStockByLocation` |
| stock | `GET /stock/:locationId/movements` | `GetStockMovements` |
| trace | `GET /trace/:batchId` | `TraceBatch` |
| trace | `GET /trace/:batchId/forward` | `TraceForward` |
| batch-events | `GET /batch-events` | `ListBatchEvents` |
| batches | `GET /batches` | `ListBatches` |
| batches | `GET /batches/:id` | `GetBatch` |

Semántica y decisiones de cada recurso (filtros, formatos, RBAC concreto, errores)
están en `docs/09-plan-de-api.md`; el mapeo error de dominio → HTTP está en la Fase 2
del mismo documento (resumen: `404`/`403`/`409`/`422`, fallback `500`).

## Estructura

```
apps/api/
├─ src/
│  ├─ main.ts                 # bootstrap + SwaggerModule (/docs, /docs-json)
│  ├─ app.module.ts           # importa los módulos + DomainExceptionFilter (APP_FILTER)
│  ├─ health/                 # GET /health (público)
│  ├─ auth/                   # login/refresh/logout/me, JWT manual, ActorGuard   → README
│  ├─ domain/                 # tokens de DI, PersistenceModule/DomainModule, EventBus → README
│  ├─ persistence/            # Drizzle + Turso, schema, migraciones, seed         → README
│  ├─ openapi/                # documento OpenAPI generado desde zod              → README
│  ├─ common/                 # ZodValidationPipe, serializadores, schemas compartidos
│  ├─ assignments/             # assign/unassign + agendas por worker/máquina
│  ├─ me/                     # GET /me/schedule (agenda propia + activeNow)
│  ├─ <recurso>/              # *.controller.ts + *.dto.ts + *.module.ts por recurso
├─ drizzle/                   # migraciones SQL versionadas (drizzle-kit generate)
└─ test/                      # unit colocados (src/**/*.spec.ts) + e2e (test/**/*.e2e-spec.ts)
```

Cada recurso del catálogo sigue el mismo patrón: el `*.dto.ts` define schema zod
(única fuente del tipo) + serializador de respuesta, y el controlador inyecta el
`Actor` y llama al caso de uso (sin reimplementar RBAC).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm --filter api start:dev` | Desarrollo con watch. |
| `pnpm --filter api build` | Compila (`nest build`, usa `tsconfig.build.json`). |
| `pnpm --filter api lint` | Oxlint type-aware sobre `src/` y `test/`. |
| `pnpm --filter api test` | Unitarios (vitest). |
| `pnpm --filter api test:e2e` | E2E (supertest sobre SQLite temporal). |
| `pnpm --filter api db:generate` | Genera una migración (`drizzle-kit generate`). |
| `pnpm --filter api db:migrate` | Aplica migraciones sobre `FABRIK_DB_FILE`. |
| `pnpm --filter api db:seed` | Siembra la demo (idempotente, `tsx`). |

## OpenAPI

`GET /docs` sirve la UI de Swagger y `GET /docs-json` el documento. Se genera desde
los **propios schemas zod** con `@asteasolutions/zod-to-openapi` (no hay decoradores
`@ApiProperty` que se desincronicen); `@nestjs/swagger` solo monta el `SwaggerModule`.
Decisión completa en [`src/openapi/README.md`](./src/openapi/README.md).
