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

## Fase 4 — Endpoints de catálogos + asignaciones ✅

- [x] Recursos REST: `materials`, `locations`, `machines`, `workers`, `recipes`,
      `assignments` con DTOs de request/response (zod).
- [x] El RBAC se delega al dominio (solo se pasa el `Actor`); la API no reimplementa roles.
- [x] Endpoints de agenda: `GET /workers/:id/schedule`, `GET /machines/:id/schedule`.

**✅ Completada:** `apps/api/src/` gana un módulo por recurso
(`materials/`, `locations/`, `machines/`, `workers/`, `recipes/`, `assignments/`),
cada uno con `*.controller.ts` + `*.dto.ts` (schemas zod + serializadores) +
`*.module.ts`. Las agendas viven en `assignments/schedule.controller.ts` (controlador
sin prefijo, rutas anidadas bajo `workers`/`machines`) porque dependen de los casos de
uso de asignaciones.

Rutas (caso de uso → ver la tabla de abajo): `materials` (POST/GET/GET :id/PATCH/
POST :id/deactivate), `locations` (POST/GET/GET :id/PATCH), `machines` (POST/GET/
GET :id/PATCH/POST :id/move), `workers` (POST/GET/GET :id/PATCH/POST :id/deactivate),
`recipes` (POST/GET/GET :id/PATCH), `assignments` (POST/DELETE :id) y las agendas
(`GET /workers/:id/schedule`, `GET /machines/:id/schedule`).

Decisiones:

- **Baja lógica con `POST :id/deactivate` (no `DELETE`).** El dominio no borra
  material/worker (es `active = false`, idempotente); un `DELETE` sugeriría un
  borrado duro inexistente. `DELETE /assignments/:id` sí existe porque
  `UnassignWorker` elimina de verdad la asignación (204).
- **`workers` no expone reactivación.** `Worker.activate()` existe en la entidad,
  pero no hay caso de uso que la envuelva y el plan no lo pide; se documenta como
  deuda (endpoint simétrico trivial de añadir).
- **`recipes` usa `PATCH`** (por coherencia); enviar `steps` **reemplaza la lista
  completa** (no merge por posición).
- **Serialización explícita por recurso.** Las entidades son instancias congeladas
  con props planas (`{ ...entity }` sería suficiente), pero `TimeSlot` guarda
  `startMinutes`/`endMinutes` como props propias: un spread filtraría detalles
  internos. `src/common/entity-serializers.ts` serializa `Quantity`/`TimeSlot` con
  lista blanca y cada recurso su entidad. Sin `Date` en el catálogo (las fechas solo
  existen en auth/trazabilidad).
- **TimeSlot wire format:** `{ daysOfWeek: number[] (0=domingo…6=sábado), start,
  end }` con horas `HH:mm`. Zod valida la forma; `TimeSlot.create` normaliza
  (deduplica/ordena días), valida el formato y `start < end` → `InvalidTimeSlotError`
  → 422.
- **Filtros de listado** (`?kind=`, `?physicalState=`, `?locationId=`, `?status=`,
  `?type=`, `?role=`, `?active=true|false`, `?outputProductId=`) mapeados a los
  `*Filter` del dominio. `?active` usa un union `"true"|"false"` (no
  `z.coerce.boolean()`, que trataría `"false"` como `true`).
- **Se retiró el andamiaje `src/dev/`** (`DevModule` + `POST /dev/auth-smoke/materials`);
  el e2e de auth ahora prueba el 403 real con `POST /materials`.

**Criterio de salida:** un e2e por recurso (crear/listar/leer/actualizar; +baja,
move, assign→agendas→unassign con 409 por solapamiento real) + 403 por rol indebido
(worker/auditor escribiendo) + auditor leyendo.

Verificación: `pnpm --filter api test` (**115 tests**, +2: serializadores de
`Quantity`/`TimeSlot`), `test:e2e` (**41 tests**, +27), `build` y `lint` (oxlint,
0 warnings / 0 errors) verdes.

| Recurso | Método y ruta | Caso de uso |
|---|---|---|
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

---

## Fase 5 — Endpoints de producción e inventario ✅

- [x] `POST /supplies/arrivals` (`RegisterSupplyArrival`).
- [x] `POST /production/start`, `POST /production/transform`, `POST /production/store`,
      `POST /production/complete`.
- [x] `GET /stock/:locationId`, `GET /stock/:locationId/movements`.

**✅ Completada:** `apps/api/src/` gana tres módulos: `supplies/`
(`SuppliesController` → `RegisterSupplyArrival`), `production/`
(`ProductionController` → start/transform/store/complete) y `stock/`
(`StockController` → stock y movimientos), siguiendo el patrón de la Fase 4
(`*.controller.ts` + `*.dto.ts` + `*.module.ts`, `DomainModule` importado, RBAC
delegado al dominio con `@Actor()`).

Decisiones:

- **`workerId` viene del `Actor`, no del cuerpo.** En `RecordTransformation` el
  dominio exige `actor.workerId === command.workerId`; el schema de
  `POST /production/transform` **no** incluye `workerId` y el controlador inyecta
  `actor.workerId`, de modo que un worker no puede registrar la transformación de
  otro. Es un endurecimiento del wire (no una regla nueva: la regla vive en el dominio).
- **`timestamp` opcional.** `RecordTransformation` acepta un `timestamp` inyectable
  (ISO 8601 → `Date`) que llega al dominio tal cual; imprescindible para tests
  deterministas de la ventana I3. Por defecto el dominio usa el instante actual.
- **Respuesta de `transform` = evento + lotes de output.** El caso de uso devuelve
  solo el `BatchEvent` (no los ids de los lotes que crea), así que el controlador
  inyecta `BatchRepository` y resuelve los outputs con
  `list({ originBatchEventId })`; así el cliente encadena el `store` del intermedio
  con la propia respuesta. Es la única lectura de apoyo del controlador.
- **`POST /production/store` (y no `POST /batches/:id/store`).** Se mantiene la ruta
  del plan; el cuerpo lleva `{ batchId, locationId }` porque aún no existe un
  recurso `batches`. `start` y `transform` devuelven **201** (crean recursos) y
  `store`/`complete` **200** (transicionan uno existente).
- **Serializadores de entidades compartidas.** `Batch`/`BatchEvent`/`StockMovement`
  las consumen varios módulos, así que sus serializadores viven en
  `src/common/entity-serializers.ts` (junto a `Quantity`/`TimeSlot`): lista blanca
  de campos y `Date` → ISO 8601. `BatchEvent` normaliza la observación (trim) y los
  opcionales se **omiten** del JSON.
- **Stock de un lugar de producción con deltas negativos.** `GET /stock/:locationId`
  agrega movimientos: tras una transformación el lugar de la máquina muestra
  `amount` negativo (consumo). `GetStockByLocation` es A/Au/**W**;
  `GetStockMovements` es A/Au (worker → 403).

**Criterio de salida:** e2e del flujo de producción completo (arribo ×2 → start →
transform paso 1 con observación → store del intermedio → transform paso 2 con merma
→ complete) que afirma estados de lote, matemática de stock por lugar (consumo debita
la máquina, `produced` acredita el almacén), orden de movimientos y eventos emitidos
(`supply.arrived` ×2, `batch.created`, `batch.transformed` ×2, `batch.stored`,
`production.completed`) vía `InMemoryEventBus`; más los errores del camino
(máquina en mantenimiento → 409, fuera de la franja I3 → 409, input inexistente →
404, output con unidad incompatible → 422) y RBAC (worker no puede `start` → 403,
auditor no transforma → 403, worker lee stock → 200). E2E de stock y movimientos
(filtro por material, lugar inexistente → 404, historial de worker → 403).

Verificación: `pnpm --filter api test` (**128 tests**, +4 serializadores de
entidades), `test:e2e` (**70 tests**, +25: 18 producción + 7 stock), `build` y `lint`
(oxlint, 0 warnings / 0 errors) verdes.

| Recurso | Método y ruta | Caso de uso |
|---|---|---|
| supplies | `POST /supplies/arrivals` | `RegisterSupplyArrival` |
| production | `POST /production/start` | `StartProduction` |
| production | `POST /production/transform` | `RecordTransformation` |
| production | `POST /production/store` | `StoreBatch` |
| production | `POST /production/complete` | `CompleteProduction` |
| stock | `GET /stock/:locationId` | `GetStockByLocation` |
| stock | `GET /stock/:locationId/movements` | `GetStockMovements` |

---

## Fase 6 — Trazabilidad ✅

- [x] `GET /trace/:batchId` (hacia atrás) y `GET /trace/:batchId/forward` (recall).
- [x] `GET /batch-events` con filtros (máquina, worker, material, rango de fechas).

**✅ Completada:** `apps/api/src/` gana dos módulos siguiendo el patrón de la Fase 4:
`trace/` (`TraceController` → `TraceBatch`/`TraceForward`) y `batch-events/`
(`BatchEventsController` → `ListBatchEvents`). Ambos importan `DomainModule` y el
RBAC sigue **delegado al dominio** (`worker` → 403; `admin`/`auditor` leen).

Decisiones:

- **Serialización recursiva de los árboles.** `trace.dto.ts` recorre los nodos del
  dominio (`BatchTraceNode`/`BatchForwardNode`) y reutiliza los serializadores
  compartidos `serializeBatch`/`serializeBatchEvent` (`src/common/entity-serializers.ts`),
  de modo que los `event` embebidos salen con `Date` → ISO 8601 y la observación
  normalizada. La forma del wire copia exactamente los DTO del dominio: en el árbol
  hacia atrás cada nodo lleva `batch` y, si lo tiene, `event`; en el hacia adelante
  un nodo lleva `batch` **o** `event` (nunca ambos), con los eventos colgando del
  lote que consumen. Los opcionales (`event`, `cycleDetected`) se **omiten** cuando
  no aplican; `cycleDetected` solo se emite cuando la rama se cortó por un ciclo en
  datos corruptos.
- **`from`/`to` ISO 8601 → `dateRange` inclusivo.** El query de `batch-events`
  valida la forma y convierte los extremos a `Date`; el `dateRange` solo se arma si
  llega al menos uno de los dos. El filtro por `materialId` coincide si el material
  aparece en **inputs o outputs** (lo implementa el repositorio).
- **404 de un `batchId` desconocido** lo lanza el dominio (`NotFoundError`) en ambas
  rutas de trace; no hay validación de existencia en la API.

**Criterio de salida:** cumplido — el e2e reconstruye la cadena de la Fase 5
(arribo ×2 → start → transform paso 1 con observación → store → transform paso 2
con merma → complete) y verifica el árbol hacia atrás (profundidad, evento con
`machineId`/`workerId`/observación, hojas = lotes de suministro), el árbol hacia
adelante (recall que alcanza los eventos consumidores y todos los lotes
descendientes) y el listado filtrado de eventos en orden cronológico (sin filtro,
máquina, worker, material por inputs **o** outputs y rango inclusivo), más RBAC
(worker 403 en los tres endpoints, auditor 200) y 404 de lote desconocido.

Verificación: `pnpm --filter api test` (**131 tests**, +3 serializadores de árboles),
`test:e2e` (**80 tests**, +10 trazabilidad), `build` y `lint` (oxlint, 0 warnings /
0 errors) verdes.

| Recurso | Método y ruta | Caso de uso |
|---|---|---|
| trace | `GET /trace/:batchId` | `TraceBatch` |
| trace | `GET /trace/:batchId/forward` | `TraceForward` |
| batch-events | `GET /batch-events` | `ListBatchEvents` |


---

## Fase 7 — Endurecimiento ✅

- [x] Seeds de demo (factory, catálogos mínimos, receta de ejemplo) para arrancar la API.
- [x] `apps/api/README.md`: arranque, env vars, migraciones, comandos.
- [x] OpenAPI con `@nestjs/swagger` (decidir y documentar) expuesto en `/docs`.
- [x] E2E smoke del flujo completo de `docs/03-flujo-de-produccion.md`.

**Seed de demo:** `apps/api/src/persistence/seed.ts` (+ `pnpm --filter api db:seed` vía
`tsx`, idempotente). Siembra 1 fábrica (inserción directa: `factories` no tiene puerto
en el dominio), 1 almacén + 1 planta de producción, 2 suministros (`Harina` kg, `Agua`
l), 1 producto intermedio (`Masa`) + 1 final (`Pan`), 1 `Mezcladora` en la planta, 1
receta de dos pasos (`harina + agua → masa → pan`), 3 usuarios de demo con credenciales
(`admin`/`admin123`, `operario`/`operario123`, `auditor`/`auditor123`) y la asignación del
operario a la máquina de lunes a domingo todo el día (I3). La idempotencia se basa en
IDs fijos + *upsert* por `id`; las credenciales solo se crean si no existen. Aplica las
migraciones antes de sembrar. Documentado en `src/persistence/README.md`.

**Smoke:** `apps/api/test/smoke/full-flow.e2e-spec.ts` recorre el ciclo de docs/03 **solo
por HTTP** (salvo el bootstrap de usuarios del helper e2e): login admin → alta de
catálogo (lugares, materiales, máquina, receta) → asignación → arribos ×2 → `start` →
`transform` paso 1 con observación → `store` del intermedio → `transform` paso 2 con
merma → `complete`; y luego, como **auditor**, reconstruye el recorrido: stock de ambos
lugares, movimientos (orden y filtros), `trace` hacia atrás desde el producto final
(hojas = suministros), `trace` hacia adelante (recall) desde un suministro, el árbol de
la orden raíz y `batch-events` filtrado por máquina.

**README:** `apps/api/README.md` se reescribe como documento de *endurecimiento*:
arranque rápido (install → `db:migrate` → `db:seed` → `start:dev`), tabla de
variables de entorno (`FABRIK_DB_FILE`, `JWT_*`, `BOOTSTRAP_ADMIN_*`, `PORT`),
**una** tabla de endpoints consolidando las de las Fases 3–6 (42 rutas con caso de
uso y marca de públicas), resumen de estructura y de comandos, y enlaces a
`docs/09` y a los READMEs de módulo. El detalle por recurso no se duplica: vive en
los READMEs de módulo y en este plan.

**OpenAPI (decisión: generación zod → OpenAPI, no decoradores).** Los controladores
validan con **zod** (`ZodValidationPipe`), no con `class-validator`, así que el
plugin automático de `@nestjs/swagger` no puede documentar los cuerpos (no hay
clases decoradas que inspeccionar). Se descartó `@ApiBody`/`@ApiProperty` manuales
por duplicar la forma ya descrita por el schema. Se eligió **`@asteasolutions/zod-to-openapi`**
(peer `zod: ^4.0.0`; zod instalado **4.6.7**) para convertir los **mismos** schemas
en schemas OpenAPI, con **`@nestjs/swagger@12`** como único servidor (`SwaggerModule.setup`);
sus peers `class-validator`/`class-transformer` son **opcionales**, así que no se
reintroduce `class-validator`. `@anatine/zod-openapi` (zod v3) y `nestjs-zod`
(`@nestjs/common` hasta `^11`, no Nest 12) quedaron fuera. El documento se sirve en
**`/docs`** (UI) y **`/docs-json`** (`/docs-yaml`), con título/versión, esquema
`bearerAuth` (http/bearer/JWT, global salvo rutas `@Public()`), las 42 rutas con
resumen y `tags` por recurso, cuerpos/querys derivados de los schemas zod y las
respuestas de error. La tabla de rutas (`OPENAPI_ROUTES`) es explícita porque los
controladores no llevan decoradores; un e2e enumera las rutas **montadas** de verdad
por Nest y exige igualdad exacta (anti-drift). Detalle en
`apps/api/src/openapi/README.md`.

**Limpieza de tipos.** `tsc -p tsconfig.json --noEmit` (que cubre `src/` **y**
`test/`, a diferencia del `tsconfig.build.json` de `nest build`) reportaba 3 errores
preexistentes en specs: dos métodos **opcionales** de puerto (`existsByName?`,
`findByMaterial?`) invocados sin estrechar, y un *cast* mutable sobre `outputs`
`readonly` de `BatchTransformedPayload`. Se corrigieron de raíz (aserción no-nula
explícita en los dos primeros —el adaptador Drizzle los implementa— y un *type
predicate* `event is BatchTransformed` en el tercero) sin tocar la estrictez; la
verificación `tsc -p tsconfig.json --noEmit` queda **limpia**.

**Criterio de salida:** cumplido — `pnpm --filter api test` (136), `test:e2e` (85:
+5 OpenAPI incluyendo el smoke de `/docs-json` y el anti-drift), `build` y `lint`
(oxlint, 0 warnings / 0 errors), `tsc -p tsconfig.json --noEmit` limpio y
`pnpm build` global (turbo, 3/3 tareas) verdes.

**✅ Fase 7 completada.** Con el seed + smoke ya hechos, esta fase cierra el
`apps/api/README.md` como documento operativo, añade OpenAPI en `/docs` generado
desde zod y deja `tsc` limpio. **Estado global del plan: Fases 0–7 completadas**;
los riesgos/decisiones pendientes (tabla error→HTTP contra consumidores reales,
Turso remoto, CORS para `apps/web`, rate limiting) siguen listados abajo.

---

## Post-plan — huecos del plan de web ✅

Rutas añadidas **después** de cerrar las Fases 0–7 (no se reescriben las fases). El
plan de web (`docs/10-plan-de-web.md`) detectó que la pantalla `/produccion` no tenía
forma de listar lotes; se añadieron dos endpoints de **solo lectura**:

- `GET /batches` (`ListBatches`): listado con los filtros opcionales de `BatchFilter`
  —`status`, `materialId`, `recipeId` y `originBatchEventId`—; sin filtros devuelve todo.
- `GET /batches/:id` (`GetBatch`): un lote por id; `NotFoundError` → 404.

Ambos son **A/Au/W** (abiertos al worker porque la pantalla de producción la consume
el operario) y se serializan con `serializeBatch` (compartido con `production`/`trace`).
No hay endpoint de escritura: los lotes se crean por los flujos de `production` y
`supplies`. Documentados en OpenAPI (`OPENAPI_ROUTES`) → **44 rutas** en total.

También se habilitó **CORS** (`enableCors`, `src/common/cors.ts`) leyendo `CORS_ORIGINS`
(lista separada por comas; default de desarrollo `http://localhost:3000`, el puerto de
`next dev`), **sin credenciales** porque la API autentica con `Authorization: Bearer` y no
usa cookies. La misma política se monta en `main.ts` y en el helper e2e.

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
- **CORS** para `apps/web`: **resuelto** — `CORS_ORIGINS` (lista por comas, default
  `http://localhost:3000`) con `credentials: false`. En producción hay que fijar la URL
  real del front; ver el post-plan.
- **Rate limiting** fuera de alcance en esta etapa (anotado como deuda).
