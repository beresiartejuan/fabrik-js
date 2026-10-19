# Fabrik — Web Demo (modo demo)

Panel de fábrica **autocontenido, sin backend real**: es un fork de
[`apps/web`](../web) donde **todas las llamadas de la capa de datos ejecutan los
mismos casos de uso del dominio** (`@fabrik/domain`) contra una base de
**`sessionStorage`** del navegador. No hay API Nest, ni `axios`, ni peticiones
de red: el transporte es código en la pestaña (módulos → use cases → repos →
`sessionStorage`). Misma UI, mismos wire DTOs (`src/lib/api/types.ts`) y mismos
mensajes de error en español que la app original.

- Arquitectura, decisiones y plan de la demo: [`docs/11-plan-demo.md`](../../docs/11-plan-demo.md).
- App original (referencia congelada, consume la API real): [`apps/web`](../web).
- Dominio compartido (`@fabrik/domain`): [`packages/domain`](../../packages/domain).
- Front en Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui; vitest
  + Testing Library para la suite.

## Qué es (y qué no es)

- **Es una demo de navegador.** "La base de datos" es un JSON en
  `sessionStorage` con schema v1 (ver abajo); los datos son falsos y viven solo
  en la pestaña.
- **No hay backend que levantar.** El login, los catálogos, la producción, el
  stock y la trazabilidad funcionan end-to-end sin ninguna request de red.
- **No mezclar con entornos reales.** Las credenciales van en claro en el
  snapshot y los datos son de juguete — nunca usar la demo con datos de
  producción ni copiarla a un deploy real.

## Arranque

```bash
pnpm install                     # desde la raíz del monorepo
pnpm --filter @fabrik/web-demo dev   # http://localhost:3000
# o, desde la raíz: pnpm dev:web-demo
```

No hace falta `.env`, migraciones ni `db:seed`: **la base del demo se siembra
sola en el primer click** (la primera operación de la pestaña crea el snapshot
semilla y corre el histórico con use cases reales antes de responder). La demo
corre sobre `localhost`/`https` (el dominio genera ids con `crypto.randomUUID`,
que exige contexto seguro).

> `pnpm dev` en la raíz corre todos los apps vía Turbo; `pnpm dev:web-demo`
> arranca solo la demo.

## Credenciales demo

El login pide *nombre* + contraseña. Los tres usuarios están sembrados como
workers activos:

| Usuario | Contraseña | Qué puede hacer |
|---|---|---|
| `admin` | `admin` | Todo: catálogos, recetas, agendas, producción, arribo. |
| `operario` | `operario` | Registrar transformaciones, arribos, almacenar/completar, ver stock. |
| `auditor` | `auditor` | Todo en **lectura** + stock, trazabilidad y eventos. |

## Cómo persiste

- Key de `sessionStorage`: **`fabrik.demo.db`** (`DEMO_DB_STORAGE_KEY`), distinta
  de la de sesión (`fabrik.session`, intacta respecto de `apps/web`).
- **Por pestaña**: cada pestaña tiene su propio mundo (lo que hagas acá no se ve
  en otra pestaña y se borra al cerrarla).
- **Schema v1**: el envelope guarda `{ schemaVersion: 1, savedAt, data }`, y
  `data` trae los agregados como snapshots planos (dates ISO, ids branded como
  strings), más el sello `historySeeded`. Si el schema no coincide al leer, se
  descarta y se re-siembra (la demo no migra nada).
- **Reset**: el botón **"Resetear demo"** del pie del sidebar (desktop) abre un
  `ConfirmDialog` y ejecuta `resetDb()` desde [`src/lib/api/demo/db.ts`](src/lib/api/demo/db.ts)
  + reload de la pestaña. Programáticamente vale lo mismo: `resetDb()` borra la
  key y el próximo acceso re-siembra todo.

## Historia sembrada

El seed maestro (`demo/seed.ts`) deja catálogos, receta y asignación, con lotes/
eventos/movimientos **vacíos**. En el **primer acceso de la pestaña**,
`demo/history.ts` corre el flujo completo de
[`docs/03-flujo-de-produccion.md`](../../docs/03-flujo-de-produccion.md)
**ejecutando los use cases reales del dominio** (nada de fixtures):

- 2 arribos de suministro al almacén (admin) → lote `stored` + `supply_in`,
- inicio de la orden **«Pan artesanal»** (`rec-pan-artesanal`, admin),
- los **2 pasos** de la receta en la **mezcladora** (`maq-mezcladora-1`) los
  ejecuta el `operario` (transformación + `produced` + almacenado),
- cierre de la orden (admin, lote final `stored`).

Resultado: **5 lotes, 2 eventos de transformación y 7 movimientos de stock**
sembrados con invariantes del dominio (I1–I7), sobre los que podés seguir
produciendo, mover stock o recorrer la trazabilidad desde el primer click.

La asignación sembrada del operario es de **jornada completa los 7 días**
(`00:00`–`24:00`, días 0–6) — combinada con el reloj del navegador que usa el
domino en demo, `activeNow` es siempre `true`: las máquinas están siempre
activas y el flujo de producción funciona a cualquier hora.

## Diferencias vs `apps/web`

Los componentes y pantallas son intactos respecto de la app original; lo que
cambia es la capa de datos (`src/lib/api/*`) y tres afinamientos de UI
declarados en docs/11:

| `apps/web` (original) | `apps/web-demo` (esta app) |
|---|---|
| Transporte HTTP real: `client.ts` (axios + interceptores, URL de la API por variable pública de entorno). | **Sin axios ni `client.ts` (eliminados)**: `src/lib/api/modules/*` llama fábricas sobre el dominio; cero requests de red. |
| Errores: el API valida con zod (`400`) y el `DomainExceptionFilter` emite 404/403/409/422/500. | **Sin `400` de zod** (gap aceptado): la pre-validación del cliente filtra la entrada y los invariantes del dominio emergen como `409`/`422` — mismo body `{ statusCode, error, message, context }`. |
| Tokens JWT de la API + scrypt en `apps/api`. | **Tokens opacos sin firma** (`demo-access.<userId>` / `demo-refresh.<userId>`, `expiresIn` decorativo); el refresh rota el par y no hay revocación. |
| La auth vive en `apps/api` (`AuthService`, `ActorGuard`). | **La auth vive fuera del dominio** (hallazgo de docs/11): `demo/auth.ts` compara la contraseña en claro contra el snapshot y resuelve el rol **fresco** de la fila (parity `ActorGuard`). |
| UI neutral. | Badge **"DEMO"** junto a la marca, hint del login con credenciales demo y botón **"Resetear demo"** — las únicas ediciones de componente, renderizadas sin flag. |

La matriz de roles/`403` (catálogos solo A/Au, `start` admin-only, `transform`
worker-only, trace/stock-movements/events A/Au) es **idéntica** en ambas: la
aplican los use cases del dominio, no la capa web.

## Estructura de `lib/api/demo/`

Todo el runtime demo vive acá (los 14 módulos de `src/lib/api/modules/*Api.ts`
conservan sus interfaces y exportan `createXxxApi(ctx = getDemoContext())`);

```
apps/web-demo/src/lib/api/demo/
├─ db.ts          # SessionDemoDb: load/save/reset sobre sessionStorage (`fabrik.demo.db`, schema v1, SSR-safe)
├─ seed.ts        # datos semilla v1 (ids legibles: usr-admin, mat-harina, rec-pan-artesanal, …)
├─ registry.ts    # composición única: 9 repos + UnitOfWork + event bus + los 39 use cases
├─ repos.ts       # los 9 repositorios demo sobre los snapshots (upsert/filtros/append-only)
├─ mappers.ts     # wire ↔ dominio ( Quantity.create, TimeSlot.create, *ToWire espejo de apps/api )
├─ auth.ts        # login/refresh/me/logout demo + codec de tokens opacos
├─ history.ts     # siembra el histórico de producción con use cases reales (una vez por mundo)
└─ module-kit.ts  # DemoContext (actor por llamada) + toApiError (espejo del DomainExceptionFilter)
```

El dominio no abstrae reloj ni ids: en demo, los use cases sellan timestamps
con el **reloj del navegador** y el `Actor` se resuelve **por llamada** del
token de la sesión (`readTokens()`), como el `ActorGuard`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm --filter @fabrik/web-demo dev` (o `pnpm dev:web-demo`) | Desarrollo en `http://localhost:3000` (Next 16 con Turbopack). |
| `pnpm --filter @fabrik/web-demo build` | Build de producción (las 20 páginas prerenderizan; con `NEXT_EXPORT=1` saca el sitio estático a `out/`, ver «Despliegue»). Con `@fabrik/domain build` previo si hay dist fresco del dominio. |
| `pnpm --filter @fabrik/web-demo test` | Suite de vitest: **475 tests / 54 archivos** en verde. |
| `pnpm --filter @fabrik/web-demo lint` | `biome check .` (Next 16 eliminó `next lint`). |

## Despliegue (GitHub Pages)

La demo no tiene backend, así que además del build de server de siempre existe
un **modo export** que saca un sitio 100% estático a `apps/web-demo/out/` y
queda listo para GitHub Pages. El build normal **no cambia un pelo** con esto:
solo si `NEXT_EXPORT=1` el `next.config.ts` activa `output: 'export'`,
`trailingSlash: true`, imágenes sin optimizar y desactiva
`cacheComponents`/`partialPrefetching` (el export es incompatible con PPR).

```bash
pnpm --filter @fabrik/domain build          # el export necesita el dist compilado del dominio
NEXT_EXPORT=1 \
NEXT_PUBLIC_BASE_PATH=/fabrik-js \
  pnpm --filter @fabrik/web-demo build      # sitio estático en apps/web-demo/out/
```

- **`NEXT_PUBLIC_BASE_PATH`** (en cualquier modo) se aplica como `basePath` de
  Next: Pages publica en `https://<owner>.github.io/<repo>/`, y el workflow le
  pasa como prefijo el nombre de este repo (`/fabrik-js`).
- **`.nojekyll`** vive en `public/` y copia a `out/`: evita que Pages procese el
  sitio con Jekyll y descarte las carpetas `_next/` (arranquen con `_`).
- El deploy lo ejecuta
  [`../../.github/workflows/deploy-demo.yml`](../../.github/workflows/deploy-demo.yml):
  se dispara por `push` solo cuando toca archivos bajo `apps/web-demo/**` (con
  `pnpm install` + `@fabrik/domain build` + el build con las dos variables de
  arriba, toma `apps/web-demo/out/` como artifact) o a mano vía
  `workflow_dispatch`.
- ⚠️ Cambio de URL **solo en esta app**: en el export no hay rutas dinámicas
  runtime, así que editar una receta es `/recetas/detalle?id=<id>` (query param,
  mismo patrón `useSearchParams` + `Suspense` del deep-link de
  `/trazabilidad`), mientras que en `apps/web` sigue siendo `/recetas/[id]`.

## Notas de Next 16

- **Este Next no es el Next de antes.** Antes de tocar código, leer la guía
  correspondiente en `node_modules/next/dist/docs/` — lo recuerda el bloque
  `BEGIN:nextjs-agent-rules` de [`AGENTS.md`](AGENTS.md).
- El shell es **client-rendered** porque los tokens viven en `sessionStorage`
  (no existe en el server): misma decisión de docs/10 que la app original.
- `next.config.ts` usa `cacheComponents: true` + `partialPrefetching: true` en
  el build normal; `params`/`searchParams` son promesas. Con `NEXT_EXPORT=1`
  (GitHub Pages, ver «Despliegue» arriba) esas flags se desactivan y el id de
  receta viaja por query param (`/recetas/detalle?id=`).

Más contexto: [`docs/11-plan-demo.md`](../../docs/11-plan-demo.md)
(objetivo, blueprint, mapa de errores, riesgos) y
[`docs/10-plan-de-web.md`](../../docs/10-plan-de-web.md) (reglas del front).