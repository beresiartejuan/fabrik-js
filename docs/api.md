# API — referencia transversal

La API de Fabrik (NestJS, ESM, Drizzle + Turso) expone los casos de uso de
`@fabrik/domain` sobre **45 rutas REST** con JWT (access + refresh) y autorización por rol
que se decide en el dominio. Esta página reúne lo **transversal** del contrato: flujos de
autenticación, convenciones REST, semántica del formato wire, el mapa completo de errores
a HTTP y la semilla de datos de demo.

No repite el listado de rutas: la tabla completa (recurso, método, ruta y caso de uso por
ruta) está en la sección [Endpoints del README de `apps/api`](../apps/api/README.md) y el
documento interactivo en `/docs` de una instancia corriendo (JSON en `/docs-json`). La
arquitectura general del sistema está en [arquitectura.md](arquitectura.md) y las deudas
conocidas en [limitaciones-conocidas.md](limitaciones-conocidas.md).

## Autenticación

Login por `name` + contraseña. Todas las rutas salvo las públicas
(`GET /health`, `POST /auth/login`, `POST /auth/refresh`) exigen
`Authorization: Bearer <access token>`; sin token o con token inválido/vencido → `401`.

| Ruta | Pública | Comportamiento |
|---|---|---|
| `POST /auth/login` | sí | `{ name, password }` → `{ accessToken, refreshToken, tokenType: "Bearer", expiresIn }`. `401` con credenciales inválidas o worker inactivo. |
| `POST /auth/refresh` | sí | `{ refreshToken }` → par nuevo de tokens. Rota el viejo; ante reuso, revoca la cadena → `401`. |
| `POST /auth/logout` | no | `204`. Revoca **todos** los refresh vivos del actor. |
| `GET /auth/me` | no | Devuelve el `Actor` `{ workerId, role }` con el rol **fresco** de la base. |

Qué rota y qué persiste:

- En `auth_credentials` persiste el hash scrypt de la contraseña (autocontenido: algoritmo,
  parámetros y sal en un único string). La comparación es `timingSafeEqual` y un login con
  nombre inexistente paga un scrypt de todos modos para no filtrar usuarios por timing.
- En `refresh_tokens` persiste **solo el SHA-256** del refresh token, con `expires_at` y
  `revoked_at`. El access token no se persiste: existe solo en el cliente.
- Cada refresh **rota** el par: el token viejo pasa `revoked_at` de `NULL` a fecha en un
  compare-and-swap, y solo el request que gana la carrera emite el par nuevo. Presentar un
  refresh ya revocado es señal de robo: se revoca toda la cadena viva del worker y se
  responde `401`.
- El rol es siempre fresco: el guard recarga el worker por request y `GET /auth/me` hace lo
  mismo; el claim `role` del JWT es informativo.
- El admin de arranque (`BOOTSTRAP_ADMIN_NAME`/`BOOTSTRAP_ADMIN_PASSWORD`) se crea al
  arrancar solo si no existe; nunca actualiza rol ni contraseña de un admin preexistente.

## Convenciones REST

- **Baja lógica con `POST :id/deactivate`, no `DELETE`.** El dominio no borra materiales ni
  workers: la baja es `active=false` e idempotente (así lo expresan
  `POST /materials/:id/deactivate` y `POST /workers/:id/deactivate`). El único borrado real
  del sistema es `DELETE /assignments/:id` (`UnassignWorker`), que responde `204`.
- **`PATCH /recipes` reemplaza la lista completa de steps.** Enviar `steps` sustituye todos
  los pasos: no hay merge por posición. La integridad final (posiciones 1..N, I7) la
  revalida el dominio.
- **Unions de filtro como strings.** Los filtros de listado viajan como texto y se mapean a
  los filter objects del dominio: `?active` usa el union `"true" | "false"` (no coerción
  booleana, que leería `"false"` como `true`), junto a `?kind=`, `?physicalState=`,
  `?locationId=`, `?status=`, `?type=`, `?role=`, `?outputProductId=` según recurso.
- **`transform` ignora `workerId` y `timestamp` del body.** El schema de
  `POST /production/transform` no incluye `workerId`: el controlador lo inyecta del
  `Actor`, de modo que un worker no puede registrar la transformación de otro. El
  `timestamp` se descarta y se usa el reloj del servidor (fuente de verdad de I3), salvo
  `FABRIK_ALLOW_CLIENT_TIMESTAMP=true` — reservado a tests e2e.
- **Respuesta de `transform` = evento + lotes de salida.** El caso de uso devuelve solo el
  `BatchEvent`; el controlador resuelve los lotes creados con una lectura de apoyo
  (`list({ originBatchEventId })`) y responde `{ event, outputBatches }`, para que el
  cliente encadene el almacenamiento del intermedio con la propia respuesta.
- **`dateRange` inclusivo.** En `GET /batch-events`, `from`/`to` (ISO 8601) forman un rango
  con ambos extremos incluidos; solo se arma si llega alguno de los dos.
- **`materialId` matchea inputs u outputs.** El filtro por material de `GET /batch-events`
  coincide con eventos donde el material aparece en **inputs o outputs** (lo implementa el
  repositorio, y así opera también la demo).
- **Códigos de estado.** `201` cuando la operación crea recursos (altas de catálogo,
  `POST /production/start`, `POST /production/transform`, `POST /supplies/arrivals`
  — devuelve el lote `stored` —); `200` cuando transiciona uno existente
  (`store`/`complete`, `PATCH`); `204` para logout y unassign.

## Semántica del wire

- **Ids como strings opacos.** Los branded ids del dominio viajan como `string`; las fechas
  en ISO 8601 UTC (`Z`); los campos opcionales **se omiten** del JSON cuando no aplican.
  Esta convención es idéntica en la API y en la demo.
- **`Quantity` = `{ amount, unit }`.** amount numérico (admite decimal) y unit del enum del
  dominio.
- **`TimeSlot` = `{ daysOfWeek, start, end }`.** Días como enteros `0`–`6`
  (0=domingo … 6=sábado), horas en `HH:mm` y `end` admite además `24:00` (fin de jornada).
  El rango es semiabierto `[start, end)`: `00:00`–`24:00` cubre el día completo, y las
  `00:00` del día siguiente pertenecen a la franja de ese otro día. La vigencia se evalúa
  en la zona local del servidor (política de I3).
- **`activeNow` es server-side.** `GET /me/schedule` devuelve la agenda del propio actor con
  la máquina enriquecida y el campo `activeNow` calculado con el reloj del servidor; el
  cliente no recalcula la vigencia de una franja con su propia zona horaria.
- **Stocks negativos en plantas.** `GET /stock/:locationId` agrega movimientos: tras una
  transformación, el lugar de la máquina muestra `amount` **negativo** (consumo debitado) —
  comportamiento esperado mientras I5 sigue diferida (ver
  [limitaciones-conocidas.md](limitaciones-conocidas.md)). El stock es siempre por lugar:
  no existe consulta global por material.
- **Detalle del agregado de stock.** La unidad de cada entrada es la del `unitOfMeasure` del
  material (el catálogo es la fuente de verdad, I6) y las filas con delta neto `0` se
  omiten del resultado.
- **Serialización de árboles de traza.** En `GET /trace/:batchId` cada nodo lleva `batch`
  siempre y `event` solo si lo tiene (las hojas — lotes de suministro — no llevan evento). En
  `GET /trace/:batchId/forward` cada nodo lleva `batch` **o** `event`, nunca ambos, con los
  eventos colgando del lote que consumen; `cycleDetected` se emite únicamente en la rama
  cortada por un ciclo. Las mismas omisiones opcionales aplican en la demo.

## Errores HTTP

Todo error de dominio sale con un cuerpo estable:

```json
{ "statusCode": 409, "error": "OverlappingScheduleError", "message": "…", "context": { } }
```

donde `error` es el nombre de la clase de dominio y `context` (opcional) son los campos
tipados propios del error (por ejemplo `{ entity, id }` o `{ machineId, status }`). El
mapeo está implementado en
[`apps/api/src/common/filters/domain-exception.filter.ts`](../apps/api/src/common/filters/domain-exception.filter.ts):
el código y su test **table-driven** son la autoridad de esta tabla.

| Clase de dominio (`error`) | HTTP | Cuándo ocurre |
|---|---|---|
| `NotFoundError` | 404 | Recurso inexistente. |
| `UnauthorizedRoleError` | 403 | Rol indebido; el RBAC vive en los use cases. |
| `OverlappingScheduleError` | 409 | I1: la franja se solapa con otra asignación del worker. |
| `InsufficientStockError` | 409 | I5; inalcanzable hoy (I5 diferida). |
| `InactiveMachineError` | 409 | Máquina en mantenimiento. |
| `InactiveWorkerError` | 409 | Worker dado de baja. |
| `InvalidStateTransitionError` | 409 | Transición de lote inválida (re-store, re-complete…). |
| `WorkerNotAssignedError` | 409 | I3: el worker no tiene asignación vigente en ese instante. |
| `SelfModificationNotAllowedError` | 409 | Anti-lockout: un admin no se cambia el rol ni se desactiva a sí mismo. |
| `LastAdminError` | 409 | Anti-lockout del último admin; inalcanzable por HTTP hoy. |
| `MaterialKindMismatchError` | 422 | Arribo con material que no es suministro. |
| `MachineTypeMismatchError` | 422 | El paso de receta no corresponde al tipo de máquina. |
| `InvalidLocationKindError` | 422 | Lugar de la clase incorrecta (almacenar fuera de `storage`, máquina fuera de `production`). |
| `IncompatibleUnitError` | 422 | I6: unidad incompatible con el estado físico del material. |
| `RecipeIntegrityError` | 422 | Receta inválida (posiciones, I7). |
| `InvalidQuantityError` | 422 | `Quantity` con amount ≤ 0. |
| `InvalidTimeSlotError` | 422 | Franja inválida (formato, rango o días). |
| `InvalidObservationError` | 422 | Observación vacía o mayor a 500 caracteres. |
| `InvalidTransformationError` | 422 | Transformación vacía o con inputs duplicados. |
| `InvalidStockMovementError` | 422 | Movimiento de stock con deltas incoherentes. |
| `NotAProductionOrderError` | 422 | `complete` sobre un lote sin `recipeId`. |
| `DomainError` (cualquier otra clase) | 500 | Fallback: se registra con el `error.name` en el log. |
| Error no reconocido (no dominio) | 500 | `error: "InternalServerError"` con mensaje genérico, sin filtrar detalles internos. |

Dos cuerpos adicionales con la misma forma general:

- **`401` de auth** (guard y `AuthService`): `{ statusCode: 401, error: "Unauthorized",
  message }` con mensajes como "Credenciales inválidas", "Refresh token revocado o
  reutilizado" o "Falta el token de acceso".
- **`400` de validación zod**: el `ZodValidationPipe` responde
  `{ statusCode: 400, error: "ValidationError", message, issues[] }`. La demo no replica
  este caso (ver [limitaciones-conocidas.md](limitaciones-conocidas.md)).

El filtro deja pasar intactas las `HttpException` de Nest y el resto cae al `500`
genérico; la demo emite el mismo mapa de clases → status con el mismo cuerpo.

## Semilla de datos (`db:seed`)

`pnpm --filter api db:seed` siembra un contexto mínimo pero completo para recorrer el flujo
productivo (el código vive en
[`apps/api/src/persistence/seed.ts`](../apps/api/src/persistence/seed.ts) y aplica las
migraciones antes de sembrar, así que puede correr sobre una base vacía):

- **1 fábrica** (`Fábrica Demo`) — la tabla `factories` no tiene puerto en el dominio, se
  inserta directa.
- **2 ubicaciones**: `Almacén central` (`storage`) y `Planta de producción` (`production`).
- **Suministros**: `Harina` (kg) y `Agua` (l).
- **Productos**: `Masa` (kg, intermedio) y `Pan` (unit, final).
- **1 máquina**: `Mezcladora` (`mixer`) en la planta, con estado `idle`.
- **1 receta de 2 pasos** (`Pan artesanal`): harina 2 kg + agua 1 l → masa 2 kg; masa
  2 kg → pan 1 unit.
- **3 usuarios demo con credenciales**: `admin`/`admin123` (admin),
  `operario`/`operario123` (worker) y `auditor`/`auditor123` (auditor).
- **La asignación del operario a la Mezcladora** de lunes a domingo, `00:00` a `24:00`
  (franja que cubre cualquier hora local, de modo que I3 se satisface siempre).

No se siembran lotes, eventos ni movimientos: el flujo productivo lo genera el usuario.
La idempotencia se basa en ids fijos + upsert; las credenciales se crean **solo si no
existen** (para restablecer una contraseña demo hay que borrar la fila y volver a correr
el seed). Las credenciales sembradas son de **desarrollo** — cámbialas antes de desplegar.

## Dónde mirar

- **Tabla completa de las 45 rutas**: [Endpoints de `apps/api/README.md`](../apps/api/README.md).
- **OpenAPI**: UI en `/docs` y JSON en `/docs-json` de la instancia corriendo; la decisión
  de generación está detallada en
  [`apps/api/src/openapi/README.md`](../apps/api/src/openapi/README.md).
- **READMEs de módulo**: [`src/auth`](../apps/api/src/auth/README.md),
  [`src/persistence`](../apps/api/src/persistence/README.md),
  [`src/domain`](../apps/api/src/domain/README.md) y
  [`src/openapi`](../apps/api/src/openapi/README.md).
- **Arquitectura general**: [arquitectura.md](arquitectura.md).