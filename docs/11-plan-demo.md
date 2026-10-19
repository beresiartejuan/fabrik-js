# Plan de Implementación — Modo Demo (fork `apps/web-demo`)

**Alcance: únicamente `apps/web-demo`** (paquete `@fabrik/web-demo`, Next 16 + React 19 + Tailwind v4 + vitest), un **fork literal de `apps/web` ya creado**, con alcance de lectura en `docs/09-plan-de-api.md` y `docs/01-dominio` vía `packages/domain` (nada más se modifica del monorepo: **`apps/web` queda intacto como referencia**; si `apps/api` necesitara cambios, se registran en los riesgos al final). Objetivo: una **app demo autocontenida** que no habla con la API Nest, ejecutando los **mismos casos de uso del dominio** (`@fabrik/domain`) con persistencia en `sessionStorage` del navegador.

Decisiones ya fijadas (no se reabren en este plan):

- **Enfoque elegido: el fork ya existe (decisión del usuario).** `apps/web-demo` (`@fabrik/web-demo`) es copia byte a byte de `apps/web`; aquí **todas** las llamadas que hoy salen por `src/lib/api/modules/*` pasan por funciones respaldadas por los **39 casos de uso** del dominio provistos por `@fabrik/domain`, con los **9 puertos + `UnitOfWork` implementados sobre `sessionStorage`**. No hay flag de build: **la app demo ES la demo**.
- **Sin axios en demo:** los fetchers axios de los módulos del fork se reemplazan por las fábricas demo (`createXxxDemoApi(ctx)`); `client.ts`/`apiClient` quedan sin usos y se eliminan con la migración de módulos (T4).
- **Wire idéntico:** los 14 módulos devuelven exactamente los mismos DTOs de `src/lib/api/types.ts` (los componentes **no cambian**); los errores son `ApiError` con el mismo `statusCode`/`error`/`context` que emitiría el `DomainExceptionFilter` de la API → `errorToMessage()` muestra los mismos mensajes.
- **Credenciales de demo tontas (requisito):** `admin/admin`, `operario/operario`, `auditor/auditor`; los tres sembrados como workers activos.
- **Tradeoff del fork, asumido honestamente:** se duplica el árbol de componentes y la suite (~304 tests copiados en verde) — **carga de mantenimiento doble y riesgo de deriva** frente a `apps/web` (R11); a cambio, evolución **independiente y con aislamiento explícito** (la app original no puede arrastrar código demo y no hay nada que "fugar"). `apps/web` queda congelado como referencia y no recibe cambios.

> **Orquestación:** implementación por tareas (T2–T6) delegadas a subagentes; T1 es este
> documento (blueprint de la arquitectura del fork). **Estados: T1 DONE** ·
> **T1.5 (scaffold del fork) DONE** · **T2 DONE** · **T3 DONE** · **T3.5 DONE** ·
> **T4a DONE** · **T4b DONE** · **T5 DONE** · **T6 DONE** — **plan COMPLETED: todas las
> tareas automatizables cerradas en verde** (suite 472 tests / 53 archivos, lint, tsc,
> build con las 20 rutas prerenderizadas; `apps/web` intacta con sus 304). Queda para la
> **tarea de commit**: walkthrough manual de los tres roles (docs/03) como smoke final y
> el commit local (Conventional Commits en inglés, **nunca push**). Filtros: **app
> original = `pnpm --filter web`** (no se toca, solo referencia) · **fork =
> `pnpm --filter @fabrik/web-demo`**. Cada tarea lista los archivos que **no debe tocar**.

---

## 1. Objetivo y principios

1. **Demo sin API.** Ninguna petición sale de la pestaña: el transporte es código en el
   navegador (módulos demo → use cases → repos en `sessionStorage`). No hay `fetch`, ni
   `axios`, ni `NEXT_PUBLIC_API_URL` en el camino demo.
2. **Wire DTOs idénticos.** `src/lib/api/types.ts` es el contrato único y no cambia: los
   módulos demo devuelven `MaterialWire`, `RecipeWire`, `BatchWire`, `MeScheduleItemWire`,
   etc., con los mismos **campos opcionales omitidos**, ids `string`, fechas ISO
   (`toISOString()` → UTC con `Z`) y `quantity`/`slot` como objetos `{ amount, unit } /
   { daysOfWeek, start, end }` que los serializadores de `apps/api/src/common/`
   emiten hoy.
3. **Cero cambios en componentes y pantallas.** Los componentes importan los singletons
   de `lib/api/modules/*` (regla 3 de docs/10). Cada módulo conserva su interfaz y tipos;
   solo cambia la línea del singleton (fábrica axios → fábrica demo). Excepciones
   cosméticas declaradas en T5: badge "DEMO" del topbar, hint del login (credenciales demo
   `admin/admin`) y botón "Resetear demo" — renderizadas **incondicionalmente** (en el
   fork no hay flag que condicione).
4. **Parity de errores (`ApiError`).** Todo fallo del camino demo se traduce a `ApiError`
   con la forma del `DomainExceptionFilter` (`{ statusCode, error, message, context? }`),
   donde `error` es el **nombre de la clase de dominio**. Así `errorToMessage()` usa la
   misma tabla de mensajes en español sin cambios, incluidos los 403 de rol, 404 y
   409/422 de negocio (sección 6). La única diferencia conocida, **aceptada**: no se
   replica la validación zod de la API (400) — los módulos confían en la pre-validación
   del cliente y los invariantes del dominio emergen como 409/422.
5. **RBAC y reglas del dominio vienen gratis.** Los use cases ya aplican roles
   (`requireRole`), invariantes I1–I7 y errores; el módulo demo solo convierte
   wire→dominio (y de vuelta) e **inyecta el `Actor`**. No se reimplementan gates en los
   módulos demo: `worker` recibe `UnauthorizedRoleError` → 403 en catálogos, exactamente
   como el `ActorGuard` + use cases de la API.
6. **La sesión no cambia.** Tokens y actor viven en `sessionStorage` con la misma key
   `fabrik.session` (`session-store.ts` intacta); en demo los tokens son cadenas opacas
   sin firmar (sección 5).

---

## 2. Arquitectura

```
┌ build/dev ───────────────────────────────────────────────────────────────────┐
│ pnpm --filter @fabrik/web-demo dev | build        (sin variables de entorno) │
└──────────────────────────────────────────────────────────────────────────────┘

   fork apps/web-demo — componentes y pantallas intactos; cambia el binding:
   src/lib/api/modules/*Api.ts (14 archivos; UNA línea cada uno):
     export const materialsApi = createMaterialsDemoApi(getDemoContext());
     // antes: createMaterialsApi() (axios) — misma interfaz (MaterialsApi/…)

   misma interfaz del módulo ⇒ componentes y useApiQuery intactos
                                       │
                                       ▼
   src/lib/api/demo/  (todo el código demo del fork vive aquí; ver riesgo de
   bundle en §8)
     ├─ db.ts          SessionDemoDb: load/save/reset sobre sessionStorage
     ├─ seed.ts        datos semilla (v1) — espejo de apps/api seed + ajustes demo
     ├─ repositories/  9 repos demo que implementan los puertos del dominio
     ├─ wire.ts        serialize*() espejo de apps/api (entity-serializers + dto)
     ├─ errors.ts      toApiErrorFromDomain() — tabla docs/09 → ApiError
     ├─ auth.ts        login/refresh/me/logout demo + resolveDemoActor()
     └─ registry.ts    getDemoContext(): { repos, unitOfWork, events, useCases }
                                       │
                                       ▼
   SessionDemoDb → sessionStorage `fabrik.demo.db` (JSON, schema `version: 1`)
```

### Flujo de una llamada

1. Un componente llama, por ejemplo, `productionApi.transform(input)` (todo cliente,
   vía `useApiQuery`).
2. En el fork el singleton ya es la fábrica demo: `productionApi` es
   `createProductionDemoApi(ctx)`.
3. El módulo demo: (a) resuelve el `Actor` con `resolveDemoActor()` (token → worker
   **fresco** del snapshot, igual que el `ActorGuard`); (b) convierte el wire
   (`QuantityWire` → `Quantity.create`, `TimeSlotWire` → `TimeSlot.create`); (c) ejecuta
   el use case `RecordTransformation.execute(actor, command)`; (d) serializa la
   entidad/VO resultante con `wire.ts` y resuelve la promesa.
4. Los repos ya persistieron (`autosave` tras cada mutación) y el UI sigue idéntico.

Puntos de conexión y decisiones:

- **`unitsForPhysicalState` / `isUnitCompatibleWith` / `TimeSlot.overlaps`** (validaciones
  pre-flight del front) ya importan del dominio: **no cambian nada**.
- **`me/schedule`:** **no es un use case del dominio**. En la API, `MeController` (rutas
  de apoyo) arma la respuesta con lecturas (`AssignmentRepository` para la agenda del
  worker + `MachineRepository` para la máquina enriquecida) y calcula `activeNow` con el
  **reloj del servidor**. El módulo demo replica ese armado con los mismos repos y
  computa `activeNow` con el **reloj del navegador** (`new Date()`), porque en demo no
  hay "servidor" (ver §4).
- **Eventos de dominio:** `EventBus` demo es un **no-op** (mismo contrato que
  `InMemoryEventBus` en producción); los eventos no se usan en ninguna pantalla, solo
  como hooks futuros.
- **`UnitOfWork`:** en demo `run(fn)` entrega los mismos repos (passthrough) y hace
  `autosave` del store al confirmar. No hay rollback real; es aceptable y se documenta
  en §8 (los use cases validan **antes** de escribir dentro del `run`, así que el riesgo
  de escritura parcial es marginal).
- **Seam descartado:** un *adapter* de axios custom (`createApiClient({ adapter })` ya
  existe en `client.ts` para tests) que intercepte todas las rutas. Es un único punto de
  integración pero obliga a reimplementar un mini-router de 45 rutas a nivel string/query
  y duplica la semántica de errores en la frontera más frágil; se descarta frente al
  patrón fábrica por módulo (más archivos, menos magia).

### Alternativa descartada

La alternativa era integrar la demo **dentro de `apps/web`** por flag de build:
`NEXT_PUBLIC_FABRIK_DEMO` inlineado por `next.config.ts`, scripts `dev:demo`/`build:demo`
y cada singleton eligiendo `demo | axios` en runtime. Evitaba duplicar componentes y
tests (mantenimiento único), pero metía el modo demo dentro del binario real (riesgo de
fuga del flag, dos conductas por build, `next.config.ts` y scripts extra). **El usuario
eligió el fork**: se asume a sabiendas el costo de mantenimiento duplicado (cada fix de
pantallas se hace dos veces, R11) a cambio de evolución independiente y aislamiento
total entre la demo y la app de referencia.

### Base de datos de demo (`SessionDemoDb`)

- **Key:** `DEMOS_DB_KEY = 'fabrik.demo.db'` (constante exportada para tests). Distinta
  de la de sesión (`fabrik.session`) para no colisionar con `session-store.ts`.
- **Schema v1** (JSON en la única key; entidades como *snapshots planos* — VOs
  aplanados e ISO dates — que los repos hidratan con `X.fromPersistence`, revalidando el
  snapshot de paso):

```jsonc
{
  "version": 1,
  "seededAt": "2026-10-19T12:00:00.000Z",
  "factory": { "id": "fct-demo", "name": "Fábrica Demo" }, // metadato, sin puerto
  "users": [ { "id": "usr-admin", "name": "admin", "password": "admin", "role": "admin", "active": true } ],
  "locations": [/* { id, name, kind } */],
  "materials": [/* { id, name, description?, kind, physicalState, unitOfMeasure, active } */],
  "machines": [/* { id, name, type, locationId, status } */],
  "workers": [/* { id, name, role, active } */], // espejo de users sin password
  "recipes": [/* { id, name, outputProductId, outputQuantity: {amount,unit}, steps: [...] } */],
  "assignments": [/* { id, workerId, machineId, slot: { daysOfWeek, start, end } } */],
  "batches": [/* { id, materialId, quantity, recipeId?, originBatchEventId?, status } */],
  "batchEvents": [/* { id, machineId, workerId, locationId, recipeStepId?, inputs, outputs, observation?, timestamp } */],
  "stockMovements": [/* { id, locationId, materialId, delta: {amount,unit}, reason, batchEventId?, timestamp } */]
}
```

- **Carga perezosa e idempotente:** el primer acceso (típicamente `authApi.login`) crea
  el snapshot semilla y lo escribe; lecturas posteriores lo reutilizan. SSR-safe: si no
  hay `window`, trabaja sobre un store en memoria y no persiste (mismo patrón que
  `resolveStorage` en `session-store.ts`), lo que mantiene el prerender de build sano.
- **Reset:** `resetDemoData()` borra la key; el próximo acceso re-siembra. Lo llamará el
  botón "Resetear demo" de T5 (demo-only) tras confirmar en un `ConfirmDialog`.
- **Versionado:** si `version !== 1` al leer → descartar + re-sembrar (no se migra: la
  demo no tiene datos valiosos).
- **Cuota:** `save()` con `try/catch` (QuotaExceeded → sigue en memoria y hace
  `console.warn`; misma tolerancia que `session-store.ts`).

---

## 3. Blueprint de puertos: repos demo a implementar

Los 9 puertos + `UnitOfWork` de `packages/domain/src/ports/` (los contratos ya están
publicados en `dist`): la implementación demo vive en
`apps/web-demo/src/lib/api/demo/repositories/*` y persiste cada agregado como array
plano del snapshot. Convenciones: `save` = upsert por `id`; `findById` → `T | null`;
`add` (los append-only) idempotente por `id`; lecturas sin orden garantizado **excepto**
lo que cada use case ya ordena.

Hallazgos T1 sobre los contratos (verificados contra `packages/domain/src/ports/`):
**9 repositorios** + `UnitOfWork` cuyo `run(fn)` entrega los repos ya construidos al
callback (no hay transacción real). Solo **dos métodos son opcionales** en los puertos —
`MaterialRepository.existsByName?` y `BatchRepository.findByMaterial?` (ningún use case
de producción los exige) — pero **el demo debe implementar todos**; los opcionales
quedan triviales y así el contrato queda completo (útil para tests del dominio).

| Puerto dominio (contrato exacto) | Repo demo (`repositories/…`) | Agregados que persiste (key snapshot) |
|---|---|---|
| `MaterialRepository`: `findById(id) → Material \| null`; `list(filter? { kind?, physicalState? }) → Material[]`; `save(material)` (upsert); `existsByName?(name)` (opcional, trivial) | `materials.ts` | `materials` |
| `LocationRepository`: `findById(id) → Location \| null`; `list(filter? { kind? })`; `save(location)` (upsert) | `locations.ts` | `locations` |
| `MachineRepository`: `findById(id) → Machine \| null`; `list(filter? { locationId?, status?, type? })`; `save(machine)` (upsert) | `machines.ts` | `machines` |
| `WorkerRepository`: `findById(id) → Worker \| null`; `list(filter? { role?, active? })`; `save(worker)` (upsert) | `workers.ts` | `workers` |
| `RecipeRepository`: `findById(id) → Recipe \| null`; `list(filter? { outputProductId? })`; `save(recipe)` (upsert; pasos con `RecipeStepId` ya asignado) | `recipes.ts` | `recipes` |
| `AssignmentRepository`: `findById(id)`; `findByWorker(workerId)`; `findByMachine(machineId)`; `save(assignment)` (upsert); `delete(id)` (borrado duro real) | `assignments.ts` | `assignments` |
| `BatchRepository`: `findById(id)`; `list(filter? { materialId?, status?, recipeId?, originBatchEventId? })`; `save(batch)` (upsert); `findByMaterial?(id)` (opcional, atajo de `list`) | `batches.ts` | `batches` |
| `BatchEventRepository`: `add(event)` (idempotente por id); `findById(id)`; `listBy(filters? { machineId?, workerId?, materialId? — inputs **o** outputs —, dateRange? { from?, to? } inclusivo })`; `listByInputBatchId(batchId)` (recall) | `batch-events.ts` | `batchEvents` (append-only: sin update/delete) |
| `StockMovementRepository`: `add(movement)` (idempotente por id); `listByLocation(locationId, materialId?)`; `sumByLocationAndMaterial(locationId, materialId) → StockDelta \| null` | `stock-movements.ts` | `stockMovements` (append-only) |
| `UnitOfWork`: `run(fn: (repos: Repositories) => Promise<T>) → Promise<T>` (los repos se inyectan en el callback) | `store.ts` (`SessionDemoUnitOfWork`) | — (manipula el store; autosave al confirmar) |

Notas de implementación:

- `existsByName` y `findByMaterial` son **opcionales** en los puertos (hallazgos T1;
  hoy ningún use case de producción las exige). Se implementan triviales y así el
  contrato queda completo.
- `listBy` debe respetar la semántica documentada del filtro `materialId`: matchear
  eventos donde el material aparece en **inputs u outputs** (la API la implementa en el
  repositorio Drizzle; el demo igual).
- La hidratación con `fromPersistence` revalida invariantes (I6 en `Material`, franjas en
  `TimeSlot`…). Es una red de seguridad intencional: un snapshot corrupto falla ruidoso.
- **El dominio no abstrae el reloj ni la generación de ids** (hallazgo T1): los use cases
  usan `new Date()` inline y las fábricas de ids (`BatchId.create()`,
  `BatchEventId.create()`, …) usan `crypto.randomUUID` de `globalThis` (§8, R2) — la
  demo corre con el **reloj del navegador**. Los ids legibles del seed (`usr-admin`,
  `mat-harina`, …) son seguros: los `BrandedId` del dominio son strings en runtime
  (`MaterialId.from('mat-harina')` funciona).

---

## 4. Blueprint de módulos demo

Cada módulo de `apps/web-demo/src/lib/api/modules/*Api.ts` mantiene su interfaz (`XApi`)
y sus tipos de input/output; el archivo reemplaza el fetcher axios (`createXxxApi(client)`)
por la fábrica demo y el singleton queda `export const xxxApi = createXxxDemoApi(ctx);`
(sin flag: la demo es la única implementación del fork). Los tests copiados de cada
módulo axios se re-escriben sobre la implementación demo en T4a/T4b.
Roles: A = admin, W = worker, Au = auditor (los gates son los del dominio, no los
reimplementan los módulos).

| Módulo del fork | Use case(s) de dominio | Gates parity (HTTP) | Notas |
|---|---|---|---|
| `materialsApi` | `ListMaterials`, `GetMaterial`, `CreateMaterial`, `UpdateMaterial`, `DeactivateMaterial` | list/get A-Au (worker → 403); escrituras A (403) | `update` no acepta `kind`/`physicalState` (entidad valida I6 al reconstituir). 422 vs 400-zod: ver §1.4. |
| `locationsApi` | `ListLocations`, `GetLocation`, `CreateLocation`, `UpdateLocation` | idem catálogos | `PATCH` solo renombra (I2 no se toca); sin baja (negocio no la tiene). |
| `machinesApi` | `ListMachines`, `GetMachine`, `CreateMachine`, `UpdateMachine`, `MoveMachine` | idem catálogos | `move` valida I2 en dominio (`InvalidLocationKindError` → 422). `status` solo lectura (`idle`/`running`/`maintenance`; sin transiciones por HTTP — gap ya documentado). |
| `workersApi` | `ListWorkers`, `GetWorker`, `CreateWorker`, `UpdateWorker`, `DeactivateWorker` | idem catálogos | Anti-lockout gratis: `SelfModificationNotAllowedError`/`LastAdminError` → 409. Sin reactivar (deuda de API). |
| `recipesApi` | `ListRecipes`, `GetRecipe`, `CreateRecipe`, `UpdateRecipe` | idem catálogos | `steps` **reemplaza la lista completa**; wire→dominio: `RecipeStep` vía `RecipeStep.create` (el dominio valida posiciones e I7 → 422). |
| `assignmentsApi` | `AssignWorkerToMachine`, `UnassignWorker`, `ListWorkerSchedule`, `ListMachineSchedule` | assign/unassign A (403); agendas A-Au (+ W solo su propia agenda: `UnauthorizedRoleError` si otro → 403) | `slot: TimeSlotWire` → `TimeSlot.create` (422 si el formato no sirve); I1 → `OverlappingScheduleError` 409; `unassign` resuelve `void` (204 en la API). |
| `meApi` | **No es un use case**: `MeController` lo arma con lecturas de apoyo (`AssignmentRepository` — agenda propia — + `MachineRepository` — máquina enriquecida) y calcula `activeNow` del lado del servidor | cualquier rol autenticado (401 solo si no hay token válido) | El módulo demo replica el armado completo (misma lectura de agenda + máquina; `machine: null` si huérfana — contrato lo admite) y computa `activeNow = assignment.slot.contains(new Date())` con **reloj del navegador**. |
| `suppliesApi` | `RegisterSupplyArrival` (A-W) | A/W (auditor → 403) | Devuelve el `BatchWire` `stored` creado; 404 material/lugar, `MaterialKindMismatchError`/`InvalidLocationKindError` 422, I6 `IncompatibleUnitError` 422. |
| `productionApi` | `StartProduction` (A), `RecordTransformation` (W), `StoreBatch` (A-W), `CompleteProduction` (A-W) | Igual que la API por dominio | `transform`: `workerId` **inyectado del actor** (el input web no lo trae) y `timestamp: new Date()` (reloj del navegador; la API manda reloj servidor — media #3). **El use case devuelve solo el `event`**: `outputBatches` se resuelve con una **lectura de apoyo fuera del use case** — `BatchRepository.list({ originBatchEventId })`, igual que hace el controlador — y el módulo demo **replica ese paso** para que la respuesta `{ event, outputBatches }` tenga la misma forma. `start`→`in_progress` con `recipeId`; `store`→`stored` (+`produced`/`transfer_in` según origen); `complete` exige `recipeId` (`NotAProductionOrderError` 422). Stocks negativos permitidos: I5 está diferida en el dominio — los consumos pueden dejar saldo negativo en plantas y la UI ya lo pinta con signo. |
| `batchesApi` | `ListBatches`, `GetBatch` | A/Au/**W** (abiertos al worker por la pantalla `/produccion`) | Filtros `status`/`materialId`/`recipeId`/`originBatchEventId`; sin filtros devuelve todo. 404 en id desconocido. |
| `stockApi` | `GetStockByLocation` (A/Au/W), `GetStockMovements` (A/Au; W → 403) | Igual que la API | Agregado de `sumByLocationAndMaterial`: unidad del **material**, entradas con delta neto 0 omitidas, montos **negativos posibles** en lugares de producción, orden por primera aparición. Movimientos ascending por `timestamp`. 404 lugar inexistente. |
| `batchEventsApi` | `ListBatchEvents` (A/Au; W → 403) | Igual que la API | Filtros `machineId`/`workerId`/`materialId`/`from`/`to` (`DateRange` inclusivo, ISO→`Date`); ascending por `timestamp`. |
| `traceApi` | `TraceBatch`, `TraceForward` | A/Au (W → 403) | Serializa los árboles `BatchTraceNode`/`BatchForwardNode` del dominio con la misma convención del `trace.dto.ts`: atrás — nodo con `batch` siempre + `event` solo si existe (hojas sin evento); adelante — nodo **lote XOR evento**, `cycleDetected` solo en la rama cortada. 404 lote desconocido. |
| `authApi` | **Fuera del dominio** (hallazgo T1: `packages/domain` no tiene puertos de credenciales/refresh; la auth vive solo en `apps/api`) | — (público login/refresh; el resto protegido → 401) | Implementación demo ad hoc; ver sección 5. |

Notas transversales:

- La conversión wire→dominio se hace con los constructores del dominio
  (`Quantity.create`, `TimeSlot.create`, passthrough de ids `XxxId.from`) — así
  `InvalidQuantityError`/`InvalidTimeSlotError` (422) sustituyen al 400 de zod (caso
  límite solo reachable a mano; la UI pre-valida).
- Serialización: `wire.ts` es espejo declarado de `apps/api/src/common/entity-serializers.ts`
  y de los serializadores por recurso (`materials/machines/…/*.dto.ts`): lista blanca de
  campos, **opcionales omitidos** (`recipeId`, `originBatchEventId`, `recipeStepId`,
  `observation`, `batchId` en quantities, `batchEventId`), `Date` → `toISOString()`
  (UTC con `Z`, igual que la API) y árboles recursivos de trace. Es duplicación
  consciente y mínima (~150 líneas) protegida por tests de parity con las fixtures
  (`src/__tests__/helpers/fixtures.ts`) que hoy espejean el wire real.
- `useApiQuery` pasa un `AbortSignal`; los fetchers axios actuales tampoco lo usan — los
  módulos demo lo ignoran igualmente (sección 8, R5).
- **No se replica la validación zod de la API (400)** — gap aceptado: los módulos confían
  en la pre-validación del cliente y los invariantes del dominio fallan como 409/422.
  Tampoco rate limiting ni JWT (obvio).

---

## 5. Auth demo

La autenticación **no pertenece al dominio** (hallazgo T1: `packages/domain` no tiene
puertos de credentials/refresh: viven solo en `apps/api`, junto al `ActorGuard`); la auth
demo es por tanto **ad hoc**. La demo implementa un `authApi` equivalente con **contrato
de sesión idéntico**:

- **Login** (`login(name, password): Promise<AuthTokensWire>`): busca el worker por
  `name` en el snapshot (parity con `AuthService.login`, que barre `workers.list()`).
  Sin match → 401 (no hay scrypt que pagar en demo, no hay timing-attack real a
  defender). Password: comparación **plana en claro** contra `users[i].password` del
  snapshot (los usuarios del seed traen la password sin hash; §7). Mismatch →
  `ApiError({ statusCode: 401, error: 'Unauthorized', message: 'Credenciales inválidas' })`
  (la misma forma que emite el `UnauthorizedException` de Nest al pasar por el filtro),
  de modo que la pantalla de login muestra **"Nombre o contraseña incorrectos."** por
  `hasStatus(401)` sin cambios. Worker inactivo → 401 `'El worker está inactivo'`.
  Éxito → `AuthTokensWire { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 }`.
- **Tokens demo:** cadenas opacas sin firma: `accessToken = 'demo-access.<userId>'`,
  `refreshToken = 'demo-refresh.<userId>'` (en el seed el id de usuario y el id de worker
  coinciden: `usr-admin`, `usr-operario`, `usr-auditor`). No vencen (`expiresIn` es
  decorativo, como el TTL default 900 de la API). El codec vive en `demo/auth.ts`
  (`encodeToken/decodeToken`).
- **Refresh** (`refresh(refreshToken)`): decodifica; si el prefijo no es `demo-refresh.`
  o el worker del snapshot no existe/está inactivo → 401 (misma forma). Caso válido →
  **par nuevo de tokens opacos frescos** (rotación trivial, sin revocación ni
  reuso-detección: en demo es inerte porque los módulos demo nunca responden 401 a menos
  que el worker haya sido cambiado). Mantener la interfaz conserva el flujo del
  `SessionProvider`/`RequireAuth` intacto.
- **`me()`** → `ActorWire { workerId, role }`: decodifica el access token de la **sesión
  actual** y **carga el worker del snapshot** entregando el **rol fresco** — parity con
  el `ActorGuard`, que no confía en el claim. Token ausente/ilegible → 401, y
  `RequireAuth` hace `signOut` (flujo existente sin cambios).
- **`logout()`** → `void` (204 en la API; en demo no-op).
- **Dónde viven los tokens:** exactamente igual que hoy — `SESSION_STORAGE_KEY =
  'fabrik.session'` (misma key que la app original) con
  `{ accessToken, refreshToken, worker, name? }` en `sessionStorage` (SSR-safe, por
  pestaña). `session-store.ts` **no cambia**: los tokens demo son strings más y el
  `SessionProvider`/`signIn`/`setWorker` funcionan igual; la pantalla de login ya hace
  `signIn(tokens, null, name)` + `me()` → `setWorker`.
- **Actor de los demás módulos:** `resolveDemoActor()` lee el access token de la sesión
  (mismo `readTokens()` público de `session-store.ts`) → decodifica `workerId` → carga
  el worker (rol fresco) → `Actor { workerId, role }`. Sin sesión o worker inexistente /
  inactivo → `ApiError 401` (los guards/flows existentes ya lo tratan: el componente
  puede deslogar si su llamada falla; en la práctica solo puede pasar tras manipular la
  demo db a mano).

---

## 6. Mapa de errores — dominio → `ApiError` (status + code)

Los módulos demo traducen cualquier `DomainError` con `toApiErrorFromDomain()` — espejo
del `DomainExceptionFilter` (`apps/api/src/common/filters/domain-exception.filter.ts`),
incluido `context` (props propias del error excepto `name`/`message`/`stack`). Tabla
completa (la misma que docs/09):

| Error de dominio → `error` en el body | status | Nota |
|---|---:|---|
| `NotFoundError` | 404 | Mensaje UI: "No se encontró el recurso." |
| `UnauthorizedRoleError` | 403 | Todos los gates de rol (worker en catálogos, auditor escribiendo…). |
| `OverlappingScheduleError` | 409 | I1; la web ya lo pre-valida (`TimeSlot.overlaps`). |
| `InsufficientStockError` | 409 | Inalcanzable hoy (I5 diferida); mapear igual. |
| `InactiveMachineError` | 409 | status `maintenance`. |
| `InactiveWorkerError` | 409 | worker dado de baja / inactivo. |
| `InvalidStateTransitionError` | 409 | lote `stored`/`completed` re-store/complete, etc. |
| `WorkerNotAssignedError` | 409 | I3 (fuera de franja). |
| `SelfModificationNotAllowedError` | 409 | anti-lockout (worker propio). |
| `LastAdminError` | 409 | inalcanzable por HTTP (la autoproceso antes); mantener. |
| `MaterialKindMismatchError` | 422 | arribo con material no-suministro. |
| `InvalidLocationKindError` | 422 | arribo `store` a lugar no-storage; máquina a lugar no-production. |
| `IncompatibleUnitError` | 422 | I6 (unidades). |
| `RecipeIntegrityError` | 422 | posiciones/I7 (el builder ya pre-valida). |
| `InvalidQuantityError` | 422 | `Quantity.create` con amount ≤ 0. |
| `InvalidTimeSlotError` | 422 | franja inválida (formato/rango/días). |
| `InvalidObservationError` | 422 | observación > `MAX_OBSERVATION_LENGTH` (500). |
| `InvalidTransformationError` | 422 | vacío o inputs duplicados. |
| `InvalidStockMovementError` | 422 | delta sin unidad coherente; no alcanza por los flujos web. |
| `NotAProductionOrderError` | 422 | `complete` sobre lote sin `recipeId`. |
| `MachineTypeMismatchError` | 422 | paso ↔ tipo de máquina. |
| `DomainError` (resto) | 500 | fallback; mensaje "Ocurrió un error inesperado." |

Extras del camino demo:

- **Auth 401:** `statusCode: 401`, `error: 'Unauthorized'`, `message: 'Credenciales
  inválidas'` / `'El worker está inactivo'` / `'Refresh token inválido o vencido'` /
  `'Falta el token de acceso'` (cuando `me()` se llama sin token). La UI ya mapea 401
  (login: mensaje propio; errores: "Tu sesión expiró. Volvé a iniciar sesión.").
- **400 (zod) no se replica — gap aceptado.** En demo la entrada inválida llega al
  dominio y falla con 409/422 (los módulos confían en la pre-validación del cliente).
  Solo reachable si alguien fabrica un payload a mano.
- El mensaje de red ("No se pudo contactar al servidor." / `isNetworkError`) no aplica
  en demo (no hay red); si un bug interno lo dispara, `toApiErrorFromDomain` nunca
  produce `isNetworkError: true` y cae en la tabla de arriba.

---

## 7. Datos semilla

Espejo exacto del seed de `apps/api/src/persistence/seed.ts` (Fase 7) con los ajustes de
demo pedidos, implementado en `apps/web-demo/src/lib/api/demo/seed.ts`. Ids **legibles
cortos**, opacos para la UI (los wire los tratan como `string`; los `BrandedId` del
dominio son strings en runtime, `MaterialId.from('mat-harina')` funciona — hallazgo T1:
el dominio no abstrae ids, así que strings legibles son entrada válida). La fábrica
(`factories`) **no tiene puerto** en el dominio: en demo queda como metadato en el
snapshot (no la consume ninguna pantalla — igual que la API).

| Entidad | id | Datos |
|---|---|---|
| Fábrica (metadato) | `fct-demo` | nombre `Fábrica Demo` |
| Lugar (storage) | `loc-almacen` | nombre `Almacén central`, kind `storage` |
| Lugar (production) | `loc-planta` | nombre `Planta de producción`, kind `production` |
| Material (supply) | `mat-harina` | `Harina`, desc "Suministro de demo", kind `supply`, estado `solid`, unidad `kg` |
| Material (supply) | `mat-agua` | `Agua`, desc "Suministro de demo", kind `supply`, estado `liquid`, unidad `l` |
| Material (product) | `mat-masa` | `Masa`, desc "Producto intermedio de demo", kind `product`, estado `solid`, unidad `kg` |
| Material (product) | `mat-pan` | `Pan`, desc "Producto final de demo", kind `product`, estado `solid`, unidad `unit` |
| Máquina | `maq-mezcladora` | `Mezcladora`, type `mixer`, en `loc-planta`, status `idle` |
| Receta | `rec-pan` | `Pan artesanal`, producto final `mat-pan` 1 `unit`, 2 pasos |
| Paso 1 | `rec-pan-p1` | position 1, machineType `mixer`, inputs `mat-harina 2 kg` + `mat-agua 1 l`, output `mat-masa 2 kg` |
| Paso 2 | `rec-pan-p2` | position 2, machineType `mixer`, inputs `mat-masa 2 kg`, output `mat-pan 1 unit` |
| Worker admin | `usr-admin` | name `admin`, role `admin`, activo, password `admin` |
| Worker operario | `usr-operario` | name `operario`, role `worker`, activo, password `operario` |
| Worker auditor | `usr-auditor` | name `auditor`, role `auditor`, activo, password `auditor` |
| Asignación | `asg-operario-mezcladora` | `usr-operario` → `maq-mezcladora`, franja `{ daysOfWeek: [0,1,2,3,4,5,6], start: '00:00', end: '24:00' }` |

Ajustes demo respecto del seed de la API:

1. **Credenciales tontas** (requisito): `admin/admin`, `operario/operario`,
   `auditor/auditor` (la API siembra `admin/admin123`, etc.). Van **en claro** dentro del
   snapshot (`users[].password`) — es una demo de navegador, no hay hash posible ni
   necesario; documentado en riesgo R7.
2. **Franjas de día completo los 7 días** (`00:00–24:00`, días 0–6): el seed de la API ya
   lo hace; **demo lo mantiene** para que `activeNow` sea siempre `true` con el reloj del
   navegador (cualquier huso horario local cae dentro de `[00:00, 24:00)`; I3 se satisface
   a cualquier hora, y `/suministros/arribo`, `store`, `complete` pasan 403-role-free).
3. **Sin lotes/eventos/stock iniciales:** igual que la API; el operario genera el flujo
   (arribo → nueva producción → transformar → almacenar → completar) dentro de la demo.
4. `seededAt` y `version: 1` viajan en el snapshot (R9).

---

## 8. Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **Prerender/SSR con `sessionStorage`** — el `next build` del fork prerenderiza y ejecuta el init de los singletons demo sin `window`. | Los singletons son constructores baratos; el store **solo toca `sessionStorage` en el primer `load()`** (llamado en runtime, dentro de componentes `'use client'` ya hidratados). `SessionDemoDb` copia el patrón SSR-safe de `session-store.ts` (`typeof window === 'undefined'` → store en memoria, no persiste). El shell ya es client-rendered (`docs/10 §App shell client-rendered`): ninguna pantalla privada se evalúa en servidor; solo se prerenderiza el HTML base de `/login` y del shell con estado de carga — sin data fetching en prerender. Verificación en T5: `pnpm --filter @fabrik/web-demo build` sin warnings de prerender. |
| R2 | **`crypto.randomUUID`** ya lo usan `BatchId.create()`/`BatchEventId.create()` del dominio (no hay abstracción de ids en el dominio). En navegador requiere contexto seguro (localhost = seguro; https = seguro); en jsdom/vitest existe (Node ≥ 20 lo trae). | El dominio ya lanza un error claro si falta. Documentar en README: la demo corre sobre `localhost`/`https`. No hay fallback (parity con la API, que también lo exige). |
| R3 | **Tamaño del bundle del dominio** — la demo importa `@fabrik/domain` (dist ESM) en el bundle. | Las importaciones de módulos demo son estáticas por módulo; el barrel del dominio es ESM y tree-shakeable a los use cases usados. Medición en T5 (`next build` del fork comparando pesos de rutas contra `apps/web`). Si pesara demasiado, se restringirá la importación a los archivos por-grupo del dominio (esfuerzo bajo). Aceptable para interna de todos modos. |
| R4 | **Timestamps ISO con offset** — `toISOString()` siempre emite UTC (`Z`), y `TimeSlot.contains` evalúa con el reloj **local del navegador** (en demo no hay servidor; el dominio usa `new Date()` inline — no hay abstracción de reloj). | Parity de wire es perfecta (la API también usa `toISOString`). La única deriva posible es el "reloj del servidor" → "reloj del navegador": con la franja semilla `00:00–24:00` cada día es equivalente; se documenta en README que la vigencia I3 mostrada en `/me/schedule` usa el reloj del cliente. |
| R5 | **Abort de `useApiQuery` no honrado por los módulos demo.** | Igual que hoy con axios (los fetchers tampoco pasan el signal); el generation id del hook previene respuestas fuera de orden. Sin acción. |
| R6 | **sessionStorage por pestaña** — la demo no comparte estado entre pestañas y se limpia al cerrar cada una. | Documentar en la UI (nota en la pantalla de login y en el README): "la demo vive en esta pestaña". Es además una ventaja (no ensucia otras pestañas). |
| R7 | **Contraseñas en claro en el snapshot** + datos falsos que parecen reales. | Solo existe en `apps/web-demo` (la app original no contiene código demo y no se toca); avisar en README que la demo nunca debe usarse con datos de producción ni copiarse a los entornos reales. |
| R8 | **Deriva de serializer/wire** — `wire.ts` duplica los serializadores de `apps/api`. | Los tests de módulos demo comparan contra las fixtures de wire (`__tests__/helpers/fixtures.ts`), que hoy están testeadas contra el wire real. Comentario `// espejo de apps/api/src/common/entity-serializers.ts — mantener sincronizado` en cada sección. |
| R9 | **Schema/version drift y datos viejos en `sessionStorage`** de demos anteriores. | `version: 1` + descartar y re-sembrar si difiere; botón "Resetear demo" (T5). |
| R10 | **Rollback de `UnitOfWork` fake.** | Passthrough con autosave; los use cases validan antes de escribir dentro del `run`. Riesgo residual: si un `run` falla a mitad de escritura, podría persistir parcial. Aceptado y documentado; revisado en tests (los errores de validación se lanzan siempre antes del primer `save`). |
| R11 | **Deriva del fork** — `apps/web-demo` duplica componentes, pantallas y suite de `apps/web`; cada fix de pantallas se hace dos veces y los dos árboles pueden divergir. | Asumido por decisión del usuario (tradeoff frente a la alternativa de flag, §2): `apps/web` queda **congelado como referencia** sin evolución en el alcance del plan, y la demo es la única que avanza. Si en el futuro ambas debieran evolucionar juntas, documentar en el README un procedimiento de sincronización (diff `apps/web` → aplicar a `apps/web-demo`). |

---

## 9. Checklist de tareas

(T1 = este documento `docs/11-plan-demo.md`; T1.5 = scaffold del fork. **T1 y T1.5 están
DONE; T2 está IN PROGRESS; T3–T6 pendientes, con las rutas ya retargeteadas al fork.**)

Criterio de salida transversal de cada tarea: `pnpm --filter @fabrik/web-demo test` (todo
verde), `pnpm --filter @fabrik/web-demo build` y `pnpm --filter @fabrik/web-demo lint`
(biome) — y commit local (Conventional Commits en inglés, **nunca push**). La app
original se corre con `pnpm --filter web …` **solo para constatar que sigue intacta**;
no recibe cambios.

### T1 — Blueprint de la arquitectura demo — ✅ **DONE**

- **Entregable:** este documento. Contiene la arquitectura del fork (§2), el blueprint de
  puertos y módulos (§3–§4), auth (§5), el mapa de errores (§6), el seed (§7) y los
  riesgos (§8), plegando los hallazgos del reporte T1:
  - la auth **no vive en el dominio** (sin puertos de credentials/refresh): auth demo
    **ad hoc** — usuarios sembrados con **passwords en claro** (`admin/admin`,
    `operario/operario`, `auditor/auditor`), tokens opacos `demo-access.<userId>` /
    `demo-refresh.<userId>`, **misma key de sesión** `fabrik.session`, `refresh` devuelve
    un token opaco fresco y `me()` devuelve el **rol fresco** del user almacenado
    (parity `ActorGuard`) — §5;
  - el dominio **no abstrae reloj ni ids**: `new Date()` inline + `crypto.randomUUID` de
    `globalThis` — la demo usa el reloj del navegador; los ids legibles del seed
    (`usr-admin`, `mat-harina`, …) son seguros porque los `BrandedId` son strings en
    runtime — §3/§7;
  - `me/schedule` **no es un use case** (lectura de apoyo del `MeController` + `activeNow`
    del lado del servidor): el módulo demo lo replica con `MachineRepository` /
    `AssignmentRepository` + `activeNow` con el reloj del navegador; las franjas semilla
    de día completo (00:00–24:00, todos los días) lo dejan siempre en `true` — §2/§4/§7;
  - `transform`: la respuesta HTTP resuelve `outputBatches` con una lectura de apoyo
    `list({ originBatchEventId })` **fuera del use case** — los módulos demo replican ese
    paso para que la forma `{ event, outputBatches }` coincida — §4;
  - puertos: **9 repositorios**, dos métodos **opcionales** (`existsByName?`,
    `findByMaterial?`) + `UnitOfWork` con `run(fn)` (repos inyectados) — el demo
    implementa **todo**, los opcionales triviales — §3;
  - gap aceptado: la demo **no replica los 400 de zod** (los módulos confían en la
    pre-validación del cliente; los invariantes del dominio emergen como 422/409) —
    §1.4/§4/§6;
  - el hint del login del fork es un hardcode heredado de `apps/web` con las credenciales
    **reales de la API seed** (`admin/admin123`): T5 lo cambia a las credenciales demo
    `admin/admin` + wording demo (cambio pequeño de componente, excepción documentada) — T5.

### T1.5 — Scaffold del fork — ✅ **DONE**

- **Resultados:**
  - `apps/web-demo` creado como **copia byte-identical de `apps/web`** (mismo árbol
    `src/**`, configs y suite); paquete renombrado a **`@fabrik/web-demo`**
    (`apps/web-demo/package.json`).
  - `biome.json` raíz actualizado: ignore `apps/web-demo/public` y exclusión
    `apps/web-demo/src/components/ui/**` (misma política que la app original).
  - `pnpm-lock.yaml`: importer `apps/web-demo` agregado.
  - Suite copiada completa en verde: **304 tests** pasando con
    `pnpm --filter @fabrik/web-demo test`.
  - **Sin código demo todavía** (T2–T4 lo agregan); el stub de `apps/web-demo/README.md`
    será reescrito en T6.
- **Filtros (memoria de trabajo):** app original → `pnpm --filter web` (intacta,
  referencia) · fork → `pnpm --filter @fabrik/web-demo`.

### T2 — Persistencia + seed — ✅ **DONE**

> **Resultado:** `demo/db.ts` (`SessionDemoDb` sobre `fabrik.demo.db`, envelope
> `{ schemaVersion: 1, savedAt, data }` + sello `historySeeded`, SSR-safe, cuota
> tolerada, `resetDb()`) y `demo/seed.ts` (inventario de §7 con credenciales tontas
> `admin/admin`, `operario/operario`, `auditor/auditor` y asignación 0–6 · 00:00–24:00).
> Verde en `pnpm --filter @fabrik/web-demo test` (la suite del fork crece a lo largo de T2–T5).

- **Archivos:** `apps/web-demo/src/lib/api/demo/db.ts` (`SessionDemoDb`, `DEMOS_DB_KEY`,
  `loadDemoStore/saveDemoStore/resetDemoData`, schema v1, SSR-safe, cuota) y
  `apps/web-demo/src/lib/api/demo/seed.ts` (inventario de §7, todos los snapshots con ids
  legibles — **archivo ya iniciado** en el scaffold).
- **Tests:** `apps/web-demo/src/__tests__/demo/db.test.ts` (load idempotente,
  save/round-trip, `version !== 1` → reseeds, SSR-safe sin window, Storage inyectable) y
  `apps/web-demo/src/__tests__/demo/seed.test.ts` (inventario exacto:
  ids/franjas/credenciales tontas, receta de 2 pasos, asignación 0–6 · 00:00–24:00).
- **Verificación:** `pnpm --filter @fabrik/web-demo test -- demo` verde.
- **NO debe tocar:** `src/lib/api/modules/*` (aún axios), `src/lib/session/*`,
  `components/**`, `next.config.ts`, `package.json`, docs. Nota: el fork **no** agrega
  scripts `dev:demo`/`build:demo` — sus propios `dev`/`build` son el modo demo.

### T3 — Repos + registry de use cases + auth demo — ✅ **DONE**

> **Resultado:** `demo/repos.ts` (los 9 puertos + `UnitOfWork` sobre los snapshots —
> archivo único en lugar de `repositories/`: contrato completo, opcionales triviales,
> filtros `materialId` inputs **u** outputs, deltas negativos), `demo/mappers.ts`
> (wire ↔ dominio espejo de `apps/api`, árbol de trace incluido — consolidó lo previsto
> como `demo/wire.ts`), `demo/auth.ts` (tokens opacos `demo-access.<id>` /
> `demo-refresh.<id>`, login/refresh/me/logout, rol fresco) y `demo/registry.ts`
> (los 39 use cases instanciados una vez). Verde en
> `pnpm --filter @fabrik/web-demo test` (`__tests__/demo/{repos,auth,registry}.test.ts`).

### T3.5 — Histórico sembrado + kit de módulos — ✅ **DONE**

> **Resultado:** `demo/history.ts` (el histórico de §"Historia sembrada" corre el flujo
> de docs/03 con use cases reales — 5 lotes / 2 eventos / 7 movimientos — una sola vez por
> mundo vía el sello `historySeeded`, con re-siembra tras `resetDb`) y
> `demo/module-kit.ts` (consolidó lo previsto como `demo/errors.ts`: `toApiError` espejo
> del `DomainExceptionFilter` + `DemoContext` singleton con `requireActor` por llamada —
> la convención de fábrica de los 14 módulos de T4a/T4b). Verde en
> `pnpm --filter @fabrik/web-demo test` (`__tests__/demo/{history,module-kit}.test.ts`).

- **Archivos:** `apps/web-demo/src/lib/api/demo/repositories/{materials,locations,machines,
  workers,recipes,assignments,batches,batch-events,stock-movements,unit-of-work}.ts`;
  `demo/wire.ts` (serializers espejo de `apps/api`, árboles trace incluidos);
  `demo/errors.ts` (`toApiErrorFromDomain` + `domainErrorContext`);
  `demo/auth.ts` (codec de tokens, login/refresh/me/logout demo, `resolveDemoActor`);
  `demo/registry.ts` (`getDemoContext()`: los 39 use casos instanciados una vez, bus
  no-op).
- **Tests:** `src/__tests__/demo/repositories.test.ts` (contrato de cada puerto contra
  `sessionStorage` inyectado: upsert, filtros —materialId inputs **u** outputs—,
  append-only, `sumByLocationAndMaterial` con deltas negativos, métodos opcionales),
  `demo/auth.test.ts` (login feliz/401/inactivo, refresh con token fresco, me con rol
  fresco, logout), `demo/errors.test.ts` (tabla de §6, contexto), `demo/wire.test.ts`
  (parity con fixtures).
- **Verificación:** `pnpm --filter @fabrik/web-demo test -- demo` verde; smoke: ejecutar
  2–3 use cases del registry contra un store en memoria.
- **NO debe tocar:** `src/lib/api/modules/*`, `components/**`, `next.config.ts`,
  `package.json`, docs.

### T4a — Módulos demo: catálogos + recetas + asignaciones + me — ✅ **DONE**

> **Resultado:** los 7 módulos reescritos **in situ** en
> `src/lib/api/modules/{materials,locations,machines,workers,recipes,assignments,me}Api.ts`
> (no archivos `*Demo.ts` aparte: cada módulo conserva su interfaz y pasa a ser la
> implementación demo — fábrica `createXxxApi(ctx = getDemoContext())`), tests
> reescritos sobre el runtime demo en `__tests__/api/*Api.test.ts` con wire parity de
> fixtures, gates de rol (worker → 403 en catálogos) e I1/I2/I6/anti-lockout → 409/422.
> Verde en `pnpm --filter @fabrik/web-demo test`.

- **Archivos:** `apps/web-demo/src/lib/api/demo/modules/{materials,locations,machines,
  workers,recipes,assignments,me}Demo.ts` + **una línea** por módulo en
  `apps/web-demo/src/lib/api/modules/{materialsApi,locationsApi,machinesApi,workersApi,
  recipesApi,assignmentsApi,meApi}.ts`
  (`export const xxxApi = createXxxDemoApi(getDemoContext());` en lugar del
  `createXxxApi()` axios; interfaces y tipos intactos).
- **Tests:** por módulo en `apps/web-demo/src/__tests__/demo/modules/*` — re-escriben la
  copia axios del módulo sobre la implementación demo: wire parity con fixtures, gates de
  rol (worker 403 en catálogos via `UnauthorizedRoleError`), I1/I2/I6/anti-lockout
  mapeados a 409/422, `me.schedule` con `activeNow` (reloj inyectable para tests).
- **Verificación:** `pnpm --filter @fabrik/web-demo test` verde.
- **NO debe tocar:** componentes/pantallas, `types.ts`, `errors.ts`, `client.ts`, docs.

### T4b — Módulos demo: supplies/production/batches/stock/events/trace — ✅ **DONE**

> **Resultado:** los 6 módulos restantes reescritos **in situ** (fábrica
> `createSuppliesApi()` 0-param, unificada a `createXxxApi(ctx = getDemoContext())` en
> T5): flujo completo demo (arribo → start → transform ×2 → store → complete afirmando
> lotes/stock/movimientos), trace atrás/adelante, filtro de `/batch-events`, worker
> `transform` con `workerId` del actor y `outputBatches` resueltos por la lectura de
> apoyo. Verde en `pnpm --filter @fabrik/web-demo test`.

- **Archivos:** `apps/web-demo/src/lib/api/demo/modules/{supplies,production,batches,
  stock,batchEvents,trace}Demo.ts` + una línea en
  `apps/web-demo/src/lib/api/modules/{suppliesApi,productionApi,batchesApi,stockApi,
  batchEventsApi,traceApi}.ts`.
- **Tests:** flujo completo demo (arribo → start → transform paso 1 → store → transform
  paso 2 → complete) afirmando lotes/estados/stock agregado/deltas de movimientos
  (§4), trace atrás/adelante vs fixtures, filtros de `/batch-events`, worker 403 en
  `batchEvents`/movements/trace, `transform` con `workerId` del actor, timestamp del
  reloj y `outputBatches` resueltos por la lectura de apoyo (§4).
- **Verificación:** `pnpm --filter @fabrik/web-demo test` verde; recorridos de rol
  completos (ver T6).
- **NO debe tocar:** los archivos de T4a (son paralelos por diseño), componentes,
  `types.ts`, `errors.ts`, `client.ts`, docs.

### T5 — Integración UI: badge DEMO + reset + hint de login — ✅ **DONE**

> **Resultado:** badge **"DEMO"** junto a la marca (aside + topbar mobile + sheet, sin
> flag); hint del login con las credenciales demo (`admin/admin`, `operario/operario`,
> `auditor/auditor`) y wording de demo (se actualizó `login.test.tsx`); y **"Resetear
> demo"** en el pie del sidebar → `ConfirmDialog` destructivo → `resetDb()` +
> `window.location.reload()` (con test del flujo: dialog → resetDb → reload stubbeado).
> Además, la limpieza de integración: fábricas **unificadas** a
> `createXxxApi(ctx = getDemoContext())` en los 13 módulos con acceso al contexto
> (`authApi` queda 0-param deliberadamente: sus operaciones nunca tocan la composición),
> y **código muerto eliminado**: `client.ts` + su test axios borrados, `errors.ts` sin
> axios (el `ApiError`/`errorToMessage` que la UI usa quedó intacto), `axios` removida de
> `package.json` — **cero** `from 'axios'`, imports de `client.ts` y
> `NEXT_PUBLIC_API_URL` en el fork. Verde: suite 472 tests / 53 archivos, lint (biome),
> `tsc --noEmit` y `build` (20 rutas prerenderizadas, sin warnings de prerender).

(Sin flag ni `build:demo`: la app demo ES la demo — no hay `NEXT_PUBLIC_FABRIK_DEMO`,
ni `next.config.ts` con env, ni scripts `dev:demo`/`build:demo`, ni `.env.example`.)

- **Archivos (todos en `apps/web-demo`):** badge `DEMO` en el topbar del `(app)/layout.tsx`
  (renderizado incondicional); **hint del login** (`src/app/login/page.tsx`: hoy hereda el
  hardcode de `apps/web` con las credenciales reales del seed de la API, `admin/admin123`
  → cambiar a las credenciales demo `admin/admin` con wording de demo; actualizar
  `src/__tests__/login.test.tsx` si algún test toca el hint — excepción de componente
  documentada); y botón **"Resetear demo"** (topbar, `ConfirmDialog` + `resetDemoData()` +
  `router.refresh()`/reload).
- **Verificación:** `pnpm --filter @fabrik/web-demo build` verde, sin warnings de
  prerender (R1); smoke manual: devtools Network durante el flujo completo (login →
  catálogos → producción → stock → trace) sin **ninguna request** a la API.
- **NO debe tocar:** `src/lib/api/demo/**` (salvo que el botón llame a `resetDemoData`),
  `client.ts`, docs.

### T6 — README demo + verificación global — ✅ **DONE**

> **Resultado:** `apps/web-demo/README.md` reescrito completo en español (qué es, arranque
> con seed automático al primer click + `dev:web-demo` raíz, tabla de credenciales,
> persistencia/schema v1/reset, historia sembrada 5 lotes/2 eventos/7 movimientos,
> diferencias vs `apps/web`, estructura de `lib/api/demo/`, puntero a este plan) con el
> conteo final de tests **(472/53)**. Verificación global automatizada cerrada en verde:
> `pnpm --filter @fabrik/web-demo test` (472/53) · `lint` (biome) · `tsc --noEmit` ·
> `build` (20 rutas prerenderizadas) · `pnpm --filter web test` (intacta: 304/45) ·
> script raíz `dev:web-demo` agregado. **Lo que queda para la tarea de commit:** el
> recorrido manual de los tres roles (docs/03) como smoke final — la captura de red del
> criterio original queda cubierta por diseño (cero `axios`/`fetch` en el camino demo,
> verificado por grep y por el build sin esa dependencia) — y el **commit local**
> (Conventional Commits en inglés, **nunca push**).

- **Archivos:** `apps/web-demo/README.md` (reemplaza el stub: sección "Modo demo" — qué
  es, cómo correrlo `pnpm --filter @fabrik/web-demo dev`, credenciales
  `admin/admin`/`operario/operario`/`auditor/auditor`, storage por pestaña y "Resetear
  demo", caveat de que los datos son falsos y no deben mezclarse con entornos reales,
  contexto seguro localhost/https (R2), la tabla del §7 resumida). **Además:** corregir el
  conteo de tests desactualizado del stub en el momento de la integración — el número
  exacto es el que arroje `pnpm --filter @fabrik/web-demo test` al cerrar T6 (la suite del
  fork diverge de la copia de `apps/web` cuando T4 re-escribe los tests de módulos).
- **Verificación global (criterio de salida del plan):**
  1. `pnpm --filter @fabrik/domain build` verde (la demo consume dist);
  2. `pnpm --filter @fabrik/web-demo test` verde completo;
  3. `pnpm --filter @fabrik/web-demo lint` (biome) verde;
  4. `pnpm --filter @fabrik/web-demo build` verde (20 rutas);
  5. recorrido manual del flujo de `docs/03-flujo-de-produccion.md` **en la demo** con
     los tres roles (admin: catálogos/recetas/asignaciones/nueva producción; worker:
     arribo, transformar paso 1 y 2, store, complete, stock; auditor: stock,
     trazabilidad, eventos), verificando los mensajes de error en español vía `ApiError`
     (403 worker en catálogos, solapamiento 409, franja 409 si se acota la asignación a
     mano, etc.);
  6. constatar que `apps/web` sigue **intacto** (sin cambios ni referencias a la demo;
     su suite, si se quiere usar como referencia, corre con `pnpm --filter web test`).
- **NO debe tocar:** ningún archivo de código fuente (ni del fork, ni de la app original).

---

## Checklist final (criterios de aceptación del modo demo)

- [x] `apps/web-demo` funciona end-to-end sin backend y sin peticiones de red. *(suite
      demo verde cubriendo los 14 módulos + flujos; cero `axios`/`fetch`/`NEXT_PUBLIC_API_URL`
      en `src/` verificado por grep y por el build sin la dependencia).*
- [x] `apps/web` queda intacta y sin referencias a la demo (suite original sin cambios, **304 tests** verdes con `pnpm --filter web`).
- [x] Mismos wire DTOs (`types.ts` sin cambios) y mismos mensajes de error (`errorToMessage()`/`ApiError` intactos; `errors.ts` quedó sin axios pero su contrato para la UI es idéntico — el fold de transporte estaba muerto en demo).
- [x] Misma matriz de roles y 403 del dominio en demo (catálogos para worker, `start` admin-only, `transform` worker-only, trace/stock-movements/batch-events A/Au).
- [x] Login demo con `admin/admin`, `operario/operario`, `auditor/auditor` (los tres seedeados y activos).
- [x] `me/schedule` con `activeNow === true` siempre (franjas 00:00–24:00 × 7 días, reloj del navegador).
- [x] "Resetear demo" restaura el estado semilla en la pestaña (*pie del sidebar → `ConfirmDialog` → `resetDb()` + reload; testeado*).
- [x] `transform` devuelve `{ event, outputBatches }` con la misma forma que la API (lectura de apoyo fuera del use case).
- [x] Documentación demo en `apps/web-demo/README.md` (conteo de tests actualizado: **472**).