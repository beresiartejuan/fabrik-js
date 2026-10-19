# Modo demo (`apps/web-demo`)

**`apps/web-demo`** (paquete `@fabrik/web-demo`) es un fork de [`apps/web`](../apps/web/README.md)
que entrega **el mismo panel sin backend**: no hay API Nest, ni `axios`, ni peticiones de
red — toda la capa de datos ejecuta en el navegador los **39 casos de uso** del dominio
compartido (`@fabrik/domain`) contra una base de `sessionStorage`. Misma UI, mismos wire
DTOs (`src/lib/api/types.ts`) y mismos mensajes de error en español que la app original.
Las pantallas no cambian; su detalle está en [pantallas.md](pantallas.md).

## Objetivo y filosofía

- **Demo sin API, por diseño.** El transporte es código en la pestaña: módulos demo →
  use cases → repos demo → `sessionStorage`. No hay flag de build ni modo alternativo:
  la app demo **es** la demo.
- **Cero cambios en componentes.** Cada módulo de `src/lib/api/modules/*Api.ts`
  conserva su interfaz y sus tipos; solo cambia la línea del singleton (fábrica axios →
  fábrica demo con `getDemoContext()`). Las únicas ediciones de componente, renderizadas
  sin condición, son el badge **"DEMO"** del sidebar, el hint del login con las
  credenciales demo y el botón **"Resetear demo"** del pie.
- **Wire DTOs idénticos.** Los 14 módulos devuelven exactamente los mismos DTOs que la
  API real (campos opcionales omitidos, fechas ISO en UTC, `Quantity` y `TimeSlot` como
  objetos), así que ningún componente sabe que está en la demo.
- **RBAC y reglas del dominio vienen gratis.** Los use cases ya aplican roles,
  invariantes I1–I7 y errores; el módulo demo solo convierte wire → dominio y de vuelta,
  e inyecta el `Actor` resuelto por llamada. Un operario que toca un catálogo recibe 403
  exactamente como contra la API.
- **Fork asumido, no flag.** El costo declarado es el mantenimiento doble: `apps/web`
  queda **congelada como referencia** y la demo evoluciona aparte (ver las limitaciones
  al final).

## La base: `fabrik.demo.db` (schema v1)

La "base de datos" es un JSON en `sessionStorage` (key **`fabrik.demo.db`**, distinta de
la key de sesión `fabrik.session`) con el envelope
`{ schemaVersion: 1, savedAt: "<ISO>", data: { users, workers, locations, materials,
machines, recipes, assignments, batches, batchEvents, stockMovements, historySeeded } }`.
Cada agregado viaja como snapshot plano (ids como strings, fechas ISO) que los repos
hidratan con los constructores del dominio, revalidando de paso.

- **Por pestaña, a propósito.** Cada pestaña del navegador tiene su propio mundo: se
  pueden abrir dos demos en paralelo sin interferirse, y cerrar la pestaña descarta el
  estado. La sesión comparte esa vida.
- **Siembra perezosa e idempotente.** El primer acceso crea el snapshot semilla y lo
  escribe; lecturas posteriores lo reutilizan. Tras un reset, el próximo acceso
  re-siembra todo.
- **Reseeding tolerante.** JSON corrupto, `schemaVersion` distinta o una forma inválida
  se descartan y se vuelven a sembrar: un estado viejo o dañado nunca tumba la demo
  (no hay datos valiosos que migrar).
- **Reset:** el botón "Resetear demo" borra la key y recarga; vale lo mismo que cerrar y
  reabrir la pestaña.

## Datos semilla

El seed (`src/lib/api/demo/seed.ts`) es **determinista** (sin `Date.now` ni
`Math.random`) y usa **ids legibles** — son UX pura: los ids del dominio son strings en
runtime. Espeja el seed real de la API con tres ajustes deliberados: contraseñas en
claro, históricos vacíos y asignación de jornada completa.

| Entidad | id | Datos |
|---|---|---|
| Usuario / worker | `usr-admin` | `admin` / `admin`, rol `admin`, activo |
| Usuario / worker | `usr-operario` | `operario` / `operario`, rol `worker`, activo |
| Usuario / worker | `usr-auditor` | `auditor` / `auditor`, rol `auditor`, activo |
| Lugar | `loc-almacen-1` | "Almacén central", kind `storage` |
| Lugar | `loc-produccion-1` | "Planta de producción", kind `production` |
| Material | `mat-harina` | "Harina", suministro, sólido, `kg` |
| Material | `mat-agua` | "Agua", suministro, líquido, `l` |
| Material | `mat-masa` | "Masa", producto intermedio, sólido, `kg` |
| Material | `mat-pan` | "Pan", producto final, sólido, `unit` |
| Máquina | `maq-mezcladora-1` | "Mezcladora", tipo `mixer`, en `loc-produccion-1`, estado `idle` |
| Receta | `rec-pan-artesanal` | "Pan artesanal": harina 2 kg + agua 1 l → masa 2 kg (paso 1), masa 2 kg → pan 1 unit (paso 2) |
| Asignación | `asg-operario-mezcladora-1` | `usr-operario` → `maq-mezcladora-1`, franja `00:00`–`24:00` los 7 días |

La franja de **jornada completa los 7 días** (el `TimeSlot` del dominio admite `24:00`
como fin) hace que `activeNow` — que en demo calcula el módulo con el reloj del
navegador — sea **siempre `true`**: las máquinas están siempre vigentes y el flujo de
producción funciona a cualquier hora local.

## Historia sembrada: use cases reales

El seed deja lotes, eventos y movimientos **vacíos**. En el **primer acceso de la
pestaña**, `history.ts` siembra el histórico ejecutando el flujo completo de producción
**con los use cases reales** del registro demo — cero fixtures: los invariantes los
imponen los propios casos de uso:

1. **Arribo ×2** (actor admin): lote `stored` por cada suministro del paso 1, en el
   almacén.
2. **Inicio de la orden** (admin): `StartProduction` → lote raíz `in_progress`.
3. **Paso 1** (operario): `RecordTransformation` + `StoreBatch` del output (masa).
4. **Paso 2** (operario): `RecordTransformation` + `StoreBatch` del output (pan).
5. **Completar** (admin): `CompleteProduction` sobre el lote raíz.

Resultado: **5 lotes, 2 eventos de transformación y 7 movimientos de stock** sembrados
con los invariantes del dominio, sobre los que podés seguir produciendo, consultar stock
o recorrer la trazabilidad desde el primer click. Dos detalles de honestidad
arquitectónica:

- **La receta se lee vía `GetRecipe`.** Las cantidades del histórico derivan de sus
  pasos, nunca se tipean duplicado: si el seed cambia, la historia sigue siendo válida.
- **Una sola vez por pestaña.** El sello `historySeeded` del snapshot hace no-op a las
  corridas siguientes; después de un reset desaparece y el histórico se resiembra
  completo.

## Sesión y auth demo

La autenticación **no vive en el dominio** (en la API real es infraestructura propia,
scrypt + JWT), así que la demo la implementa ad hoc con el mismo contrato observable:

- **Login** por nombre + contraseña con comparación **en claro** contra el snapshot
  (contraseñas de juguete sembradas en `users[].password` — la demo nunca debe usarse
  con datos reales). Credenciales inválidas y usuario desconocido producen **el mismo**
  401 ("Credenciales inválidas": la UI no delata cuál falló y muestra "Nombre o
  contraseña incorrectos").
- **Tokens opacos sin firma:** `demo-access.<userId>` y `demo-refresh.<userId>`, con
  `tokenType: 'Bearer'` y `expiresIn` decorativo — no vencen. El refresh rota el par
  (valida el prefijo y que el worker exista y esté activo); no hay revocación ni
  detección de reuso, que en demo es inerte.
- **`me()` con rol fresco** (paridad del `ActorGuard`): el token solo lleva el id; el
  rol se lee de la fila del worker en cada llamada, así que un cambio de rol hecho por
  los use cases se refleja en la próxima petición. Sin token, o con worker inexistente
  o inactivo → 401 y el flujo de sesión existente desloguea.
- **La sesión no cambia:** tokens y actor en `sessionStorage` con la key
  `fabrik.session`, igual que `apps/web`; `session-store.ts` queda intacto.

## Errores: paridad con la API

Todo fallo del camino demo se traduce a `ApiError` con la forma del
`DomainExceptionFilter` (`{ statusCode, error, message, context? }`), donde `error` es
el nombre de la clase de dominio. La tabla completa de status y códigos está en
[api.md](api.md) — no se repite acá. `errorToMessage()` consume esa forma sin cambios y
muestra los mismos mensajes en español que el panel real (los mismos de la tabla de
[pantallas.md](pantallas.md)). Las diferencias del modo demo son solo tres:

- **Sin 400 de zod.** La API valida la entrada con esquemas (400); la demo no replica
  esa capa: confía en la pre-validación del cliente y los invariantes del dominio
  emergen como 409/422 — ver
  [limitaciones-conocidas.md](limitaciones-conocidas.md#demo-sin-errores-400-de-zod).
- **401 demo.** Login, refresh y `me()` emiten 401 con los mensajes de auth demo
  ("Credenciales inválidas", "El worker está inactivo", "Refresh token inválido"); la
  UI los mapea igual que los de la API.
- **Sin error de red.** No hay red: ningún fallo demo produce el mensaje "No se pudo
  contactar al servidor."; un bug interno cae en la tabla general como 500.

## Despliegue a GitHub Pages

La demo no tiene backend, así que existe además un **modo export estático** que la
publica como sitio de GitHub Pages mediante
[.github/workflows/deploy-demo.yml](../.github/workflows/deploy-demo.yml)
(**Deploy Demo (GitHub Pages)**).

- **El porqué del export condicionado.** Con `NEXT_EXPORT=1`, el `next.config.ts` del
  fork activa `output: 'export'` (sitio 100 % estático en `apps/web-demo/out/`) y
  `trailingSlash: true` (cada ruta como `index.html`, que Pages resuelve bien), y
  **apaga `cacheComponents`/`partialPrefetching`**: el export es incompatible con el
  prerender parcial. El build normal de la demo no cambia un pelo.
- **Base path derivado del repo.** La app se sirve desde la subruta del dominio de
  Pages (`https://<owner>.github.io/<repo>/`); el workflow fija
  `NEXT_PUBLIC_BASE_PATH=/${{ github.event.repository.name }}` (el nombre del repo, no
  un valor hardcodeado), y la config lo aplica como `basePath` de Next.
- **`.nojekyll`.** Vive en `public/` y copia a `out/`: evita que Pages procese el sitio
  con Jekyll y descarte las carpetas `_next/`.
- **Diferencia honesta de ruta.** El export es estático y no deja navegación runtime,
  así que el detalle de receta pasa de `/recetas/[id]` (en `apps/web`) a **query param**:
  `/recetas/detalle?id=<recipeId>`, con el mismo patrón de `useSearchParams` + `Suspense`
  que el deep-link de trazabilidad. Es la única diferencia de URL entre las dos apps.
- **Cuándo corre.** `push` a `main` **solo** si cambian `apps/web-demo/**` o el propio
  workflow (los cambios del resto del monorepo no re-publican) y republicación manual
  vía `workflow_dispatch`. Un lock de concurrencia cancela el deploy en curso si llega
  otro push seguido. El pipeline: checkout → pnpm → Node 22 → install con lockfile →
  build del dominio (la demo consume su `dist`) → **test de sanidad de la suite demo**
  → build export con las dos variables → subida del artefacto (`apps/web-demo/out`) →
  `deploy-pages`.
- **Activación de Pages, una vez a mano.** Habilitar Pages por API exige un token con
  permisos de administración (el `GITHUB_TOKEN` no alcanza), así que la primera vez hay
  que ir a **Settings → Pages → Build and deployment → Source: GitHub Actions**. Sin
  ese paso, el job de build termina verde (export + artefacto) y falla solo el deploy;
  hecho, todo deploy posterior es automático. En Pages todo lo del modo demo sigue
  valiendo: estado por pestaña (cada visita nueva arranca del seed) y contexto seguro
  garantizado por `https` (requisito de `crypto.randomUUID`).

## Limitaciones propias del modo demo

- **Sin 400 de zod** (la única divergencia de comportamiento con la API): ver
  [limitaciones-conocidas.md](limitaciones-conocidas.md#demo-sin-errores-400-de-zod).
- **El estado vive y muere en la pestaña.** `sessionStorage` es por pestaña: la demo no
  comparte mundo entre pestañas ni sesiones, y se limpia al cerrar. Es deliberado (dos
  demos paralelas no se contaminan) y el "Resetear demo" afecta solo a la pestaña
  actual.
- **Deriva del fork.** La demo duplica componentes, pantallas y capa demo de
  `apps/web`; cada mejora de pantallas potencialmente se hace dos veces. `apps/web`
  queda **congelada como referencia** (la app original no recibe código demo ni al
  revés), y el README de la demo documenta eso y el cómo compararla.

## Punteros de operación

Cómo correrla en local, credenciales, comandos y estructura exacta de `lib/api/demo`:
[apps/web-demo/README.md](../apps/web-demo/README.md) — en corto, `pnpm dev:web-demo`
desde la raíz del monorepo (no necesita `.env`, migraciones ni `db:seed`: la base se
siembra sola en el primer click). El objetivo y decisiones del fork están en
[plans/11-plan-demo.md](plans/11-plan-demo.md); la arquitectura del panel que comparte, en
[pantallas.md](pantallas.md).