# Pantallas — el panel web

El panel (`apps/web`) es una app **Next.js 16 (App Router) + React 19 + Tailwind v4 +
shadcn/ui**, íntegramente en español, que consume `apps/api` por HTTP. Este documento
describe la experiencia de uso: el shell, las 15 pantallas y su contrato con la API.
Cómo levantarla: [apps/web/README.md](../apps/web/README.md). El detalle de endpoints,
códigos y payloads vive en [api.md](api.md).

## Arquitectura de la experiencia

- **Shell client-rendered.** Toda la app se renderiza en cliente: la sesión (tokens y
  actor) vive en `sessionStorage`, que no existe en el servidor, así que un shell SSR
  añadiría estados intermedios sin beneficio para una herramienta interna. El
  `layout.tsx` raíz queda mínimo (fuentes, `lang="es"`, metadata) y el grupo `(app)` usa
  `'use client'` en su layout y páginas.
- **Guards por ruta.** `RequireAuth` envuelve el shell (sin sesión → redirect a
  `/login`) y `RequireRole` protege las pantallas por rol. El RBAC real lo decide el
  dominio en la API (403): el filtro de la UI es solo UX.
- **Sidebar desde el registro de navegación.** `src/lib/nav.ts` es la única fuente de la
  matriz ruta × rol (cada ítem trae su etiqueta, sus roles y un flag `enabled`); el
  sidebar y los CTAs del dashboard se generan de ahí, nunca se duplican listas de rutas.
- **Dashboard por rol como hub.** `/` cambia según el rol del actor: el admin recibe
  accesos a catálogos, acciones rápidas (nueva producción, arribo) y contadores de
  catálogo; el operario ve "Mis máquinas de ahora" desde `GET /me/schedule` con
  `activeNow` calculado en el servidor y acceso directo a registrar transformación y
  arribos; el auditor ve los últimos eventos y accesos a stock y trazabilidad.
- **Español en toda la superficie.** Cantidades como `2 kg` (la unidad unitless se
  rotula "u"), fechas con `Intl.DateTimeFormat('es')`, días como `dom`…`sáb` y horas
  `HH:mm`. Las pre-validaciones de formulario reutilizan el dominio puro
  (`TimeSlot.overlaps`, `unitsForPhysicalState`), igual que la API.
- **Ids cortos con referencia completa.** Los UUID de lotes y eventos se abrevian en
  tablas, selects y banners (`#<primeros 8 caracteres>…`) para no romper la maqueta; el
  id completo queda en el `title` del elemento y de vuelta en el input para copiar y
  pegar.
- **Toasts y estados consistentes (toolkit compartido).** `useApiQuery` carga y expone
  el estado; `PageLoading` (skeletons, `role="status"`) cubre la carga inicial,
  `QueryError` muestra el error con botón "Reintentar", `EmptyState` cubre el vacío con
  copy orientador, `DataTable` da búsqueda y orden local, y `useErrorToast` traduce los
  fallos a toasts en español. Ninguna pantalla improvisa variante propia.

## Las 15 pantallas

Roles: **admin**, **operario** y **auditor**. Los roles de la tabla son los que *ven*
cada ruta (fuente: `nav.ts`); el RBAC efectivo lo impone la API.

| # | Ruta | Pantalla | Roles | Endpoints consumidos |
|---|---|---|---|---|
| 1 | `/login` | Inicio de sesión | público | `POST /auth/login`, `GET /auth/me` |
| 2 | `/` | Dashboard por rol | los tres | `GET /auth/me`, `GET /me/schedule`, `GET /batch-events`, `GET /materials`, `GET /machines`, `GET /workers` |
| 3 | `/materiales` | Catálogo de materiales | admin escribe, auditor lee | `GET/POST /materials`, `PATCH /materials/:id`, `POST /materials/:id/deactivate` |
| 4 | `/ubicaciones` | Catálogo de lugares | admin escribe, auditor lee | `GET/POST /locations`, `PATCH /locations/:id` |
| 5 | `/maquinas` | Catálogo de máquinas | admin escribe, auditor lee | `GET/POST /machines`, `PATCH /machines/:id`, `POST /machines/:id/move` |
| 6 | `/trabajadores` | Catálogo de trabajadores | admin escribe, auditor lee | `GET/POST /workers`, `PATCH /workers/:id`, `POST /workers/:id/deactivate` |
| 7 | `/recetas` (+ `/recetas/nueva`, `/recetas/[id]`) | Recetas y builder de pasos | admin escribe, auditor lee | `GET /recipes`, `POST /recipes`, `PATCH /recipes/:id`, `GET /materials` |
| 8 | `/asignaciones` | Agenda máquina/operario | admin escribe, auditor lee | `GET /machines`, `GET /workers`, `GET /machines/:id/schedule`, `GET /workers/:id/schedule`, `POST /assignments`, `DELETE /assignments/:id` |
| 9 | `/produccion` | Lotes en curso | los tres | `GET /batches?status=in_progress`, `GET /batches/:id` |
| 10 | `/produccion/nueva` | Iniciar orden desde receta | admin | `GET /recipes`, `POST /production/start` |
| 11 | `/produccion/registrar` | Registrar transformación | operario | `GET /auth/me`, `GET /me/schedule`, `GET /batches`, `POST /production/transform`, `POST /production/store`, `POST /production/complete` |
| 12 | `/suministros/arribo` | Arribo de suministros | admin, operario | `GET /materials?kind=supply`, `GET /locations?kind=storage`, `POST /supplies/arrivals` |
| 13 | `/stock` | Stock por lugar + movimientos | los tres | `GET /locations`, `GET /stock/:locationId`, `GET /stock/:locationId/movements`, `GET /materials` |
| 14 | `/trazabilidad` | Genealogía hacia atrás + recall | admin, auditor | `GET /trace/:batchId`, `GET /trace/:batchId/forward`, `GET /batch-events` |
| 15 | `/eventos` | Historial de transformaciones | admin, auditor | `GET /batch-events`, `GET /machines`, `GET /workers`, `GET /materials` |

## Acceso y hub

**`/login` (1).** Única pantalla pública, sin sidebar. Pide *nombre* + contraseña; al
enviar, guarda el par de tokens en `sessionStorage` y redirige a `/` (o directamente si
ya hay sesión). Credenciales inválidas (401) muestran "Nombre o contraseña incorrectos";
un fallo de red, "No se pudo contactar al servidor." El botón se deshabilita mientras
envía.

**`/` (2).** Tarjetas y listas simples, sin gráficos, cargando solo los datos del rol
del actor. Cada tarjeta navega a la pantalla correspondiente; "Mis máquinas de ahora"
del operario muestra la máquina resuelta y la franja vigente, con estado vacío explícito
("Todavía no hay máquinas asignadas en este momento.").

## Catálogos (3–6)

Mismo patrón en las cuatro pantallas: `DataTable` con búsqueda y orden local, badges de
estado, botón "Nuevo" que abre un `FormDialog` shadcn y acciones por fila (editar, dar
de baja, mover). La **escritura es solo admin**: el auditor ve las tablas sin acciones
de escritura, y el operario no navega a estos módulos — ver
[limitaciones-conocidas.md](limitaciones-conocidas.md#catálogos-solo-para-admin-y-auditor).

- **Materiales (3).** Nombre, descripción, clase (suministro/producto), estado físico y
  unidad: la unidad se filtra por estado físico (`unitsForPhysicalState` del dominio)
  para no ofrecer combinaciones inválidas. Baja lógica vía `deactivate`.
- **Ubicaciones (4).** Nombre y clase (producción/almacén). Editar solo renombra: la
  clase no se toca tras crear.
- **Máquinas (5).** Nombre, tipo (texto libre con `datalist` de los tipos existentes) y
  lugar (solo de producción). La acción "Mover" cambia el lugar con
  `POST /machines/:id/move`. El estado de la máquina es de solo lectura: la API no
  expone transiciones.
- **Trabajadores (6).** Nombre, rol y activo. Baja lógica; no hay reactivación — la API
  tampoco la tiene, así que el botón queda deshabilitado con nota.

## Recetas y builder (7)

La lista (`GET /recipes`) muestra nombre, producto de salida y cantidad de pasos. Crear
y editar abren **páginas dedicadas** (`/recetas/nueva`, `/recetas/[id]`) porque el
builder no cabe en un diálogo.

- **Cabecera:** nombre, producto de salida (select de productos) y cantidad, con la
  unidad derivada del material elegido.
- **Pasos ordenados:** lista con añadir/eliminar y subir/bajar; la posición se
  recalcula 1..N al reordenar. Cada paso lleva tipo de máquina (`datalist`), insumos
  repetibles (material + cantidad) y su propio producto y cantidad de salida.
- **Pre-flight en cliente:** al menos un paso, posiciones consecutivas y coincidencia
  del output del último paso con el producto de la receta; la unidad se restringe por
  material. Los errores se muestran inline por campo.
- **Guardar:** `POST /recipes` o `PATCH /recipes/:id`. Enviar `steps` **reemplaza la
  lista completa** (semántica de la API, sin merge por posición). La integridad final la
  revalida el dominio y el 422 llega mapeado como toast
  ("Unidad o receta incompatible. (detalle)").

## Asignaciones (8)

Vista de agenda con dos lentes: por máquina (`GET /machines/:id/schedule`) y por
operario (`GET /workers/:id/schedule`), renderizadas como grilla semanal (columnas
lunes a domingo) o lista agrupada.

- **Asignar (admin):** diálogo con operario activo, máquina y **editor de `TimeSlot`**:
  días como toggles (lunes primero) y horas en formato `HH:mm`, con `24:00` admitido
  como fin de jornada. La pre-validación usa `TimeSlot.overlaps` contra la agenda del
  operario, fresca al abrir el diálogo: si el borrador cruza una franja existente, avisa
  inline "Se solapa con <operario>:" y deshabilita el submit. El 409 del servidor
  (`OverlappingScheduleError`) muestra el mensaje amigable como red de seguridad.
- **Desasignar:** `DELETE /assignments/:id` con `ConfirmDialog`.

## Producción (9–11)

**`/produccion` (9).** Lista de lotes en curso desde `GET /batches?status=in_progress`
(la API filtra además por `materialId`/`recipeId`/`originBatchEventId`), con buscador
por id (`GET /batches/:id`), badge de estado, enlace a trazabilidad y acción "Registrar
transformación" para el operario.

**`/produccion/nueva` (10, admin).** Select de receta con vista previa de pasos →
`POST /production/start { recipeId }` → redirige a `/produccion` mostrando el lote raíz
creado (`in_progress`). El 404 de receta inexistente se mapea como toast.

**`/produccion/registrar` (11, operario).** El corazón operativo del panel:

- **Máquina:** selector alimentado solo por `GET /me/schedule` — las máquinas asignadas
  al actor **ahora mismo** (`activeNow` calculado en el servidor, el mismo reloj que
  impone la vigilancia I3) y operativas en estado. La vigencia no se recalcula en
  cliente; si la franja venció entre carga y envío, el 409 (`WorkerNotAssignedError`)
  llega mapeado al mismo mensaje.
- **Paso de receta (opcional):** derivado de la receta del lote, filtrado por el tipo de
  la máquina elegida.
- **Insumos:** filas `{ batchId, quantity }` con picker sobre `GET /batches` (trae
  material, cantidad y estado por lote; los `completed` no se ofrecen). La unidad sale
  del lote.
- **Salidas:** filas `{ materialId, quantity }` con la unidad derivada del material
  (modo catálogo). Sin lectura de catálogos, el modo manual pide el id y la unidad a
  mano — la API revalida la coherencia de unidades — ver
  [limitaciones-conocidas.md](limitaciones-conocidas.md#catálogos-solo-para-admin-y-auditor).
- **Observación:** textarea con contador de caracteres, máximo 500
  (`MAX_OBSERVATION_LENGTH` del dominio).
- **Enviar:** `POST /production/transform` devuelve el evento y sus lotes de salida; el
  panel de seguimiento ofrece "Almacenar lote" (`POST /production/store` en un lugar de
  almacén) y "Completar producción" (`POST /production/complete`, sobre la orden raíz,
  la que trae `recipeId`). Errores 409/422 mapeados a los mensajes de la tabla de abajo.

## Arribo de suministros (12)

Material de tipo suministro + cantidad (unidad derivada del material) + lugar de tipo
almacén → `POST /supplies/arrivals`. El 201 devuelve el lote `stored` creado: toast con
el id abreviado y botón "Registrar otro" que limpia el formulario. Con 403 de lectura de
catálogos, el operario carga el arribo en modo manual (ids y unidad a mano); la API
valida la correspondencia exacta (422) igual que en modo catálogo.

## Stock (13)

Selector de lugar (producción y almacén) → `GET /stock/:locationId` en tabla: material
resuelto por nombre, cantidad **con signo y color** — en lugares de producción los
consumos suman montos negativos que se pintan en rojo — y unidad, ver
[limitaciones-conocidas.md](limitaciones-conocidas.md#i5-stock-negativo-en-plantas).

- **Drawer de movimientos (admin/auditor):** seleccionar una fila abre un panel con
  `GET /stock/:locationId/movements?materialId=`: fecha, delta, motivo en español
  ("Ingreso de suministro", "Producción", "Consumo"…) y enlace al evento que lo originó.
- **Operario:** puede leer el stock (la consulta es para los tres roles) pero entra en
  modo manual — elige el lugar pegando su id — y no tiene acceso al historial de
  movimientos (403). El stock global por material no existe: siempre se consulta por
  lugar.
- La razón `transfer_out` existe en el modelo pero la API aún no expone un flujo que la
  genere — ver
  [limitaciones-conocidas.md](limitaciones-conocidas.md#transfer_out-no-implementado).

## Trazabilidad (14)

Buscador por **id de lote** (con helper de "lotes recientes" derivado de los eventos) y
deep-link `?batch=<id>`: entrar con ese query param aterriza con el árbol ya cargado —
el buscador de `/produccion` lo enlaza.

- **Genealogía (hacia atrás):** `GET /trace/:batchId` renderiza el árbol con un
  componente recursivo; cada nodo muestra el lote (material, cantidad, estado) y su
  evento cuando existe (máquina, operario, fecha, observación). Si el wire trae
  `cycleDetected`, la rama cortada se marca con badge "ciclo detectado".
- **Recall (hacia adelante):** pestaña con `GET /trace/:batchId/forward`, los productos
  afectados; cada nodo es un lote **o** un evento, nunca ambos.
- Lote desconocido → 404 con mensaje amigable y estado vacío. No hay búsqueda por
  material, nombre ni fecha: la búsqueda es por id.

## Eventos (15)

Historial cronológico ascendente de transformaciones con filtros de **máquina,
operario, material y rango temporal** (`from`/`to` `datetime-local`, convertidos a ISO
con offset para la API). El formulario edita un borrador y el botón "Aplicar filtros"
dispara la consulta: la tabla no refetchea en cada pulsación. Columnas: fecha y hora,
máquina, operario, entradas, salidas y observación (truncadas, con el resumen en
`title`), más búsqueda local sobre el contenido.

La API no pagina aún: la tabla recorta en cliente a los 200 eventos más recientes con
una nota visible ("Mostrando los últimos N de M eventos") — ver
[limitaciones-conocidas.md](limitaciones-conocidas.md#eventos-sin-paginación).
Solo admin y auditor.

## Errores → mensajes

La UI no muestra errores crudos: `errorToMessage()` (en
`apps/web/src/lib/api/errors.ts` — **errors.ts es la autoridad de esta tabla**) prioriza
el nombre de la clase de dominio que viaja en `error` del body y cae al status HTTP si
el nombre no está mapeado. Los status que produce cada error de dominio están en
[api.md](api.md).

| `error` en el body | Mensaje mostrado |
|---|---|
| `OverlappingScheduleError` | "El trabajador ya tiene una asignación en ese horario." |
| `InsufficientStockError` | "Stock insuficiente para esa salida." |
| `WorkerNotAssignedError` | "No estás asignado a esa máquina en este horario." |
| `InactiveMachineError` | "La máquina no está operativa (mantenimiento)." |
| `InactiveWorkerError` | "Tu usuario no está activo." |
| `InvalidStateTransitionError` | "El lote no admite esa transición de estado." |
| `IncompatibleUnitError` | "Unidad o receta incompatible. (detalle del servidor)" |
| `RecipeIntegrityError` | "Unidad o receta incompatible. (detalle del servidor)" |
| `InvalidTransformationError` | "La transformación no es válida (vacía o con inputs repetidos)." |
| `InvalidObservationError` | "La observación supera el máximo de 500 caracteres." |
| `NotAProductionOrderError` | "El lote no pertenece a una orden de producción (sin receta)." |
| `MaterialKindMismatchError` | "El material es de la clase equivocada (suministro/producto)." |
| `InvalidLocationKindError` | "El lugar es de la clase equivocada (producción/almacén)." |
| `MachineTypeMismatchError` | "El paso de receta no corresponde al tipo de esa máquina." |

| Situación sin nombre mapeado | Mensaje mostrado |
|---|---|
| Sin respuesta del servidor (red, CORS, timeout) | "No se pudo contactar al servidor." |
| 401 (solo si llegara a la UI: el interceptor lo resuelve antes) | "Tu sesión expiró. Volvé a iniciar sesión." |
| 403 | "No tenés permisos para esta acción." |
| 404 | "No se encontró el recurso." |
| 500 o cualquier status ≥ 500 | "Ocurrió un error inesperado." |
| Otro status con `message` | el `message` del servidor; si llega vacío, "Ocurrió un error inesperado." |

El 401 casi nunca se ve: el interceptor de la capa HTTP intenta un refresh
**single-flight** (los 401 concurrentes comparten la misma promesa en vez de disparar N
refreshes rotativos) y reintenta la petición con el token nuevo; si el refresh falla,
limpia la sesión y redirige a `/login`.

## Accesibilidad y consistencia

El toolkit compartido también fija la base de accesibilidad: etiquetas visibles en todos
los campos y `aria-label` descriptivos en los controles repetidos ("Insumo 3 ·
Cantidad", "Quitar salida 2", "Ordenar por Máquina"), `aria-live="polite"` en contadores
y estados de carga, y `role="note"|"alert"|"status"` en avisos, errores y banners. Las
primitivas shadcn/ui traen foco visible (`focus-visible`) y navegación por teclado
estándar; los diálogos y el drawer de movimientos capturan y devuelven el foco.