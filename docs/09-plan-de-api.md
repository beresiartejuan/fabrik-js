# Plan de Implementación — API (`apps/api`)

**Alcance: únicamente `apps/api`** (NestJS 12, ESM, vitest). No toca el dominio salvo
el *packaging* de la Fase 0.

Decisiones ya fijadas (no se reabren en este plan):

- **Persistencia:** Drizzle ORM + Turso/SQLite. Los adaptadores viven **solo** en
  `apps/api` e implementan los 9 puertos + `UnitOfWork` del dominio.
- **EventBus:** in-process (`InMemoryEventBus`) en esta etapa.
- **Auth:** JWT manual (sin librería de auth), access + refresh, con un guard que
  resuelve el `Actor { workerId, role }` del dominio por request.
- **Roles:** admin / worker / auditor (auditor solo lectura). La autorización vive en
  los use cases; la API solo aporta el `Actor` y traduce los errores a HTTP.
- **Dominio:** `packages/domain` **emite `dist` consumible** (resuelto en Fase 0; antes
  exponía `src/`, lo que provocaba TS2834 bajo `nodenext`).

> **Orquestación:** la implementación se delega fase por fase a subagentes. Cada fase
> termina con **tests verdes** y un **commit local** (Conventional Commits en inglés,
> **nunca push**). El corte entre fases es el *criterio de salida* de cada una.

---

## Fase 0 — Empaquetado consumible del dominio ✅ (completada, 342 tests)

- [x] Añadir extensión `.js` a los *imports* relativos de `packages/domain/src/**`
      (válido bajo `bundler` y `nodenext`); no se cambian símbolos públicos.
- [x] Cambiar el `exports` map de `packages/domain/package.json` a `dist`:
      `"types": "./dist/index.d.ts"`, `"default": "./dist/index.js"`; idem `main`/`types`.
- [x] Confirmar que `pnpm --filter @fabrik/domain build` emite `dist/*.js` + `*.d.ts`.
- [x] Importar al menos un símbolo en `apps/api` (`import { Quantity } from '@fabrik/domain'`)
      y verificar `pnpm --filter api build`.
- [x] Actualizar `packages/domain/README.md` y `decisiones-y-limitaciones.md` (ya **no**
      se "expone el fuente"; queda obsoleto el caveat `nodenext`/TS2834).

**✅ Completada:** `@fabrik/domain` se consume compilado (`exports` → `dist/index.js` +
`dist/index.d.ts`), los *imports* relativos llevan `.js`/`index.js`, `apps/api` compila
sin TS2834 ni error de resolución en runtime, `apps/web` sigue compilando y los 342 tests
del dominio (más `typecheck`) siguen verdes. `tsconfig.json` emite (excluye `src/__tests__`);
`tsconfig.typecheck.json` cubre fuente + tests.

**Criterio de salida:** `pnpm --filter @fabrik/domain build` produce `dist` con `.js` y
`.d.ts`; `apps/api` importa `@fabrik/domain` y compila sin TS2834; los 342 tests del
dominio siguen verdes.

---

## Fase 1 — Persistencia (Drizzle + Turso) ✅

- [x] Dependencias: `drizzle-orm@1.0.0-rc.4` + `@tursodatabase/database@0.8.3`;
      `drizzle-kit@1.0.0-rc.4` y `tsx` en dev. **Decisión de cliente** (ver abajo):
      el SDK moderno de Turso (`@tursodatabase/database`) en vez de `@libsql/client`.
- [x] `drizzle.config.ts` (dialect `sqlite`) + cliente en `src/persistence/client.ts`.
      Base local por env var **`FABRIK_DB_FILE`** (default `./data/fabrik.db`). Seed queda para F7.
- [x] Esquema derivado de las entidades: `factories`, `materials`, `locations`,
      `machines`, `workers`, `recipes` (+ `recipe_steps` + `recipe_step_inputs`), `assignments`,
      `batches`, `batch_events` (+ `batch_event_inputs`/`batch_event_outputs`), `stock_movements`.
- [x] Tablas **append-only** para `batch_events` y `stock_movements`: los adaptadores solo
      exponen `add`/lecturas (`findBy`/`list`/`sum`), nunca `UPDATE`/`DELETE` (I4).
- [x] Migraciones con `drizzle-kit generate` (SQL versionado en `apps/api/drizzle/`) y
      entrypoint `pnpm --filter api db:migrate` (migrador del driver sobre `FABRIK_DB_FILE`).
- [x] Mappers entidad ↔ fila por agregado (`fromPersistence`; VO ⇄ columnas;
      `Quantity`/`StockDelta` → amount+unit; `TimeSlot` → days + start/end; fechas → `timestamp_ms`).
- [x] Adaptadores de los **9 repositorios** + `DrizzleUnitOfWork` (`run` sobre
      `db.transaction` con repositorios ligados al `tx`; commit si resuelve / rollback si lanza).
- [x] Tests de integración por repositorio (SQLite temporal) que ejercitan el
      **contrato del puerto** (`findById → T | null`, `save` = upsert, `list` con filtros,
      `add` idempotente, `listByInputBatchId`, `sumByLocationAndMaterial` con deltas negativos),
      más commit/rollback del `UnitOfWork`.

**✅ Completada:** `apps/api/src/persistence` implementa los 9 puertos + `UnitOfWork`
sobre Drizzle y el motor Turso embebido. Cliente elegido: **`@tursodatabase/database`**
(el SDK actual de Turso) con el driver **`drizzle-orm/tursodatabase/database`**, que
Drizzle solo expone en la línea **v1.0 RC** (el estable 0.45.x limita a `@libsql/client`);
versiones pineadas. Esquema con IDs `text`, `Quantity` → `amount`(real)+`unit`(text),
`TimeSlot` → `days_of_week` `"0,2,5"` + `start`/`end` `"HH:mm"`, fechas en
`integer(timestamp_ms)`; `batch_events`/`stock_movements` append-only. `factories` se
modela a nivel de tabla (sin puerto, por eso sin adaptador). Documentación en
`apps/api/src/persistence/README.md` y `apps/api/README.md`.

**Criterio de salida:** migraciones aplican sobre una base vacía (idempotente, vía
`db:migrate` y `db:migrate:prod`); los 9 adaptadores tienen test de integración verde
(42 tests de persistencia) que cubren su contrato; dos tests de `UnitOfWork` demuestran
**commit** y **rollback** (una excepción no deja filas persistidas en varios repositorios).
`pnpm --filter api test` (53 tests, incluye el scaffold) y `pnpm --filter api build`
verdes; `oxlint` sin errores ni warnings.

---

## Fase 2 — Infraestructura Nest ✅

- [x] Módulo(s) de *wiring*: providers puerto→adaptador y **use cases como providers**
      (factory providers que inyectan puertos, `UnitOfWork` y `EventBus`).
- [x] `InMemoryEventBus` implementando `EventBus` (`publish` no-op/suscribible).
- [x] `ExceptionFilter` que mapea `DomainError` → HTTP (tabla abajo); fallback 500.
- [x] Estrategia de validación: **DTOs con zod** (recomendado, schemas compartibles con
      el front) + `ValidationPipe`. Documentar la decisión frente a class-validator.

| Error de dominio | HTTP |
|---|---|
| `NotFoundError` | 404 |
| `UnauthorizedRoleError` | 403 |
| `OverlappingScheduleError` | 409 |
| `InsufficientStockError` | 409 |
| `InactiveMachineError` / `InactiveWorkerError` | 409 |
| `InvalidStateTransitionError` | 409 |
| `MaterialKindMismatchError` / `InvalidLocationKindError` | 422 |
| `IncompatibleUnitError` / `RecipeIntegrityError` | 422 |
| `InvalidQuantityError` / `InvalidTimeSlotError` / `InvalidObservationError` | 422 |
| `InvalidTransformationError` / `InvalidStockMovementError` / `NotAProductionOrderError` | 422 |
| `WorkerNotAssignedError` (violación de I3) | 409 |
| `DomainError` (resto) | 500 |

**Criterio de salida:** un `TestingModule` resuelve un use case y lo ejecuta end-to-end
contra SQLite; test *table-driven* verifica que cada error del catálogo se mapea al
status esperado.

**✅ Completada:** `apps/api/src/domain/` contiene `tokens.ts` (un `symbol` por puerto
—los puertos son interfaces, no existen en runtime—), `PersistenceModule`
(conexión única + `DbLifecycle` que aplica migraciones en `onModuleInit` y cierra en
`onModuleDestroy` + los 9 adaptadores + `DrizzleUnitOfWork`) y `DomainModule`, que
provee el `InMemoryEventBus` y los **37 casos de uso** con un **factory provider
explícito por caso de uso** (token = la propia clase; sin reflexión, porque los
constructores reciben interfaces). `InMemoryEventBus` solo implementa `publish`
(el contrato no tiene `subscribe`): acumula los eventos para los tests y en
producción es no-op. `DomainExceptionFilter` global (`APP_FILTER`) traduce la tabla
error→HTTP con cuerpo `{ statusCode, error, message, context? }` (`context` son los
campos tipados del error); `HttpException` pasa sin tocar y lo desconocido cae a un
500 genérico. Se añadió `zod` (`ZodValidationPipe`): se prefirió a `class-validator`
porque el schema es reutilizable en `apps/web` y el tipo se infiere de él; decisión
documentada en `src/domain/README.md`. El andamiaje `AppController`/`AppService` se
sustituyó por un `HealthController` (`GET /health` → `{ ok: true }`).

Verificación: `pnpm --filter api test` (**78 tests**, 25 nuevos), `build` y
`lint` (oxlint, 0 warnings/0 errores) verdes. Matiz: `WorkerNotAssignedError`
(existe en el dominio y en la tabla de arriba) caía en el fallback
`DomainError → 500` porque en Fase 2 el filtro no lo listaba; **resuelto en la
Fase 3**, que lo añade a los conflictos (409) con su caso table-driven.

---

## Fase 3 — Auth (JWT) ✅

- [x] Endpoints `POST /auth/login` y `POST /auth/refresh` (y `logout` si es barato).
- [x] Hash de contraseña con `node:crypto` **scrypt** (sin dependencias nativas pesadas;
      salt por usuario + comparación `timingSafeEqual`). Documentar la elección.
- [x] Access token corto (~15 min) + **refresh rotativo persistido** en `refresh_tokens`
      (el refresh viejo se revoca al rotar).
- [x] `ActorGuard` que valida el access token y resuelve `Actor { workerId, role }`;
      decorador `@Actor()` inyecta el actor en el handler y en el use case.
- [x] Secretos por env var (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).

**✅ Completada:** la auth vive **solo** en `apps/api` (`src/auth/`), keyed por
`workerId`: el `Worker` del dominio no gana campos de password. Tablas nuevas
`auth_credentials` (una por worker; el `password_hash` scrypt es autocontenido:
incluye algoritmo, parámetros y sal) y `refresh_tokens` (se guarda **solo** el
SHA-256 del token; `revoked_at` marca rotación/logout), generadas con
`pnpm --filter api db:generate` (segunda migración, aplicada por el mismo
`DbLifecycle`). Endpoints: `POST /auth/login` (público), `POST /auth/refresh`
(público), `POST /auth/logout` (204, protegido) y `GET /auth/me` (protegido;
devuelve el `Actor` y sirve de smoke del guard).

Decisiones:

- **Login por `name` + contraseña.** El `Worker` del dominio se identifica por
  `name` (no hay email/username) y no se quiso inventar un campo de identidad
  nuevo. Limitación: `name` debería ser único; hoy lo garantiza el seeding/uso, no
  el esquema.
- **Rol fresco desde la BD, no del claim.** El guard recarga el worker en cada
  request (debe existir y estar activo) y toma su rol actual; un token viejo no
  conserva privilegios si al worker le cambian el rol o lo dan de baja. El claim
  `role` viaja en el token, pero solo es informativo.
- **Guard global con `@Public()`.** `ActorGuard` se registra con `APP_GUARD` y deja
  pasar las rutas marcadas `@Public()` (`/health`, `/auth/login`, `/auth/refresh`).
  Así ninguna ruta queda pública por descuido. El guard **solo autentica** (401);
  la autorización por rol sigue en los use cases (`UnauthorizedRoleError` → 403).
- **JWT manual, cero deps extra.** HMAC-SHA256 desde `node:crypto` y JWS compacto
  `header.payload.signature` (base64url), con `exp`/`iat`/`sub`/`role`/`typ`/`jti`.
  ~60 líneas; se evita `jsonwebtoken`/`jose`. El refresh token es también un JWT
  firmado con `JWT_REFRESH_SECRET`, identificado por `jti`, y su hash se persiste.
- **scrypt** (`N=2^14`, `r=8`, `p=1`, sal de 16 B, `timingSafeEqual`) frente a
  argon2/bcrypt: viene en `node:crypto`, sin addon nativo. En login con usuario
  inexistente se paga un scrypt igualmente para no filtrar nombres por timing.
- **Bootstrap de admin por env** (`BOOTSTRAP_ADMIN_NAME`/`BOOTSTRAP_ADMIN_PASSWORD`):
  en `onApplicationBootstrap` crea (si no existen) worker `admin` + credencial.
  Idempotente; evita un seeder completo (eso es Fase 7).
- **Ruta de andamiaje `POST /dev/auth-smoke/materials`.** Como la Fase 4 aún no
  tiene controladores, se añadió un controlador de desarrollo que ejecuta
  `CreateMaterial` con el `Actor`, para probar por e2e la cadena
  guard → use case → `DomainExceptionFilter` (admin 201 / auditor 403). Se
  mantiene porque prueba esa cadena de forma permanente; se retira cuando la
  Fase 4 cubra el mismo camino.

Variables de entorno:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (**obligatorias** fuera de tests; el
  arranque falla en claro si faltan).
- `JWT_ACCESS_TTL_SECONDS` (default 900) y `JWT_REFRESH_TTL_SECONDS` (default
  2592000).
- `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` (juntas o ninguna).

**Criterio de salida:** e2e `login → llamada protegida`: rol correcto 200, rol
incorrecto 403, sin token / token vencido 401; el refresh rota y revoca el anterior.

Verificación: `pnpm --filter api test` (**113 tests**, 35 nuevos), `test:e2e`
(**14 tests**, 13 nuevos) y `build`/`lint` (oxlint, 0 warnings / 0 errors) verdes.


---

## Fase 4 — Endpoints de catálogos + asignaciones

- [ ] Recursos REST: `materials`, `locations`, `machines`, `workers`, `recipes`,
      `assignments` con DTOs de request/response (zod).
- [ ] El RBAC se delega al dominio (solo se pasa el `Actor`); la API no reimplementa roles.
- [ ] Endpoints de agenda: `GET /workers/:id/schedule`, `GET /machines/:id/schedule`.

**Criterio de salida:** un e2e por recurso (crear/listar/leer/actualizar) + un caso 403
por rol indebido (p. ej. `worker` escribiendo catálogo).

---

## Fase 5 — Endpoints de producción e inventario

- [ ] `POST /supplies/arrivals` (`RegisterSupplyArrival`).
- [ ] `POST /production/start`, `POST /production/transform`, `POST /production/store`,
      `POST /production/complete`.
- [ ] `GET /stock/:locationId`, `GET /stock/:locationId/movements`.

**Criterio de salida:** e2e del flujo de producción (arribo → transformación con merma →
store → complete) con eventos emitidos y estados correctos; e2e de stock y movimientos.

---

## Fase 6 — Trazabilidad

- [ ] `GET /trace/:batchId` (hacia atrás) y `GET /trace/:batchId/forward` (recall).
- [ ] `GET /batch-events` con filtros (máquina, worker, material, rango de fechas).

**Criterio de salida:** dado el flujo de la Fase 5, los endpoints devuelven el árbol
genealógico esperado y el listado filtrado de eventos en orden cronológico.

---

## Fase 7 — Endurecimiento

- [ ] Seeds de demo (factory, catálogos mínimos, receta de ejemplo) para arrancar la API.
- [ ] `apps/api/README.md`: arranque, env vars, migraciones, comandos.
- [ ] OpenAPI con `@nestjs/swagger` (decidir y documentar) expuesto en `/docs`.
- [ ] E2E smoke del flujo completo de `docs/03-flujo-de-produccion.md`.

**Criterio de salida:** `pnpm --filter api test` y `test:e2e` verdes; `pnpm build`
global verde; el smoke recorre el ciclo de producción de punta a punta.

---

## Riesgos y decisiones pendientes

- **Confirmar la tabla error→HTTP** (sobre todo 409 vs 422 y el fallback 500) contra los
  consumidores reales.
- **zod vs class-validator** para DTOs/pipes: **decidido zod** en la Fase 2 (schemas
  reutilizables en `apps/web` + tipos inferidos; ver `src/domain/README.md`).
- **Hash de contraseña**: scrypt de `node:crypto` vs argon2 (nativo). Se elige scrypt salvo
  requisito explícito.
- **Turso local (archivo) vs remoto**: local para desarrollo/tests; definir la URL remota y
  el *seeding* en despliegue.
- **CORS** para `apps/web`: pendiente de la URL del front (dev/prod).
- **Rate limiting** fuera de alcance en esta etapa (anotado como deuda).
