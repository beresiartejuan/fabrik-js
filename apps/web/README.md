# Fabrik — Web

Panel de administración del monorepo `fabrik-js`: producción, stock y trazabilidad.
Es una app **Next.js 16 (App Router)** + **React 19** con **shadcn/ui + Tailwind
v4** que consume `apps/api` por HTTP con **axios** (instancia compartida con
interceptores y refresh de sesión en `sessionStorage`). Toda la app se
renderiza en cliente y es 100 % en español.

- Plan y decisiones del front: [`docs/10-plan-de-web.md`](../../docs/10-plan-de-web.md).
- API (contrato, seed, env, endpoints): [`../api/README.md`](../api/README.md).
- Dominio compartido (`@fabrik/domain`): [`../../packages/domain/README.md`](../../packages/domain/README.md).
- Plan de la API: [`docs/09-plan-de-api.md`](../../docs/09-plan-de-api.md).

## Arranque paso a paso

La web **no funciona sola**: necesita la API corriendo con la base migrada y
sembrada.

1. **API arriba** (prerequisito — detalle en el README de `apps/api`):

   ```bash
   pnpm install
   cp apps/api/.env.example apps/api/.env
   pnpm --filter api db:migrate       # migra FABRIK_DB_FILE
   pnpm --filter api db:seed          # siembra la demo (idempotente)
   pnpm --filter api start:dev        # watch en http://localhost:3001
   ```

   Smoke: `GET http://localhost:3001/health` (o Swagger UI en `/docs`).

2. **Env de la web** (desde la raíz del monorepo):

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

3. **Levantar la web**:

   ```bash
   pnpm --filter web dev              # http://localhost:3000
   ```

   En Next 16 `next dev` usa **Turbopack** por defecto y sirve en el puerto
   `3000` — el origen que el CORS default de la API ya permite.

4. **Entrar** con una credencial demo (el login pide *nombre* + contraseña):

   | Usuario | Contraseña | Qué puede hacer |
   |---|---|---|
   | `admin` | `admin123` | Todo: catálogos, recetas, agendas, producción, arribo. |
   | `operario` | `operario123` | Registrar transformaciones, arribos, ver stock. |
   | `auditor` | `auditor123` | Todo en **lectura** + stock, trazabilidad y eventos. |

> `pnpm dev` / `pnpm build` en la raíz corren ambos apps vía Turbo; los
> accesos directos `pnpm dev:web` y `pnpm dev:api` arrancan uno solo.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Base URL de la API. Debe ser accesible **desde el navegador**: el axios del cliente la usa directo (sin proxy ni rewrites). |

> **Caveat:** las variables `NEXT_PUBLIC_*` se **hornean en build time**. Si la
> cambiás, no alcanza con reiniciar el proceso: hay que rehacer
> `pnpm --filter web build` (y volver a desplegar). En desarrollo, reiniciá
> `next dev` para que lea el `.env.local` nuevo.

## Comandos

Desde la raíz del monorepo (o `pnpm -C apps/web <comando>`):

| Comando | Qué hace |
|---|---|
| `pnpm --filter web dev` | Desarrollo en `http://localhost:3000` (Turbopack). |
| `pnpm --filter web build` | Build de producción (`next build`, también Turbopack). |
| `pnpm --filter web test` | Suite de vitest (unit + Testing Library sobre jsdom). |
| `pnpm --filter web lint` | `biome check .` — Next 16 eliminó `next lint`; el lint corre con Biome aparte. |
| `pnpm --filter web start` | Sirve el build de producción. |

La suite cierra **verde** con 293 tests (estado Fase 6 de docs/10).

## Roles y qué ve cada uno

El **RBAC real lo decide el dominio** en la API (`403`); la web solo filtra
navegación y acciones por rol con el mismo criterio. Matriz del sidebar
(`src/lib/nav.ts`):

| Sección | admin | worker | auditor |
|---|:---:|:---:|:---:|
| `/` — dashboard rol-aware | ✓ | ✓ | ✓ |
| Catálogos: `/materiales`, `/ubicaciones`, `/maquinas`, `/trabajadores` | ✓ (escribe) | — | ✓ (solo lectura) |
| `/recetas` (lista + builder `nueva`/`[id]`) | ✓ | — | ✓ (lectura) |
| `/asignaciones` (agenda máquina/worker) | ✓ | — | ✓ |
| `/produccion` (lotes activos + buscador) | ✓ | ✓ | ✓ |
| `/produccion/nueva` | ✓ | — | — |
| `/produccion/registrar` (transformar) | — | ✓ | — |
| `/suministros/arribo` | ✓ | ✓ | — |
| `/stock` | ✓ | ✓ (degradada: ids manuales) | ✓ |
| `/trazabilidad` (genealogía + recall) | ✓ | — | ✓ |
| `/eventos` (listado filtrado) | ✓ | — | ✓ |

Notas: un `admin` **no** registra transformaciones (worker-only por dominio).
Donde la API no permite al `worker` leer catálogos (`A/Au`), sus pantallas
degradan a entrada manual de ids/unidad con nota visible — ver los *gaps* del
final de docs/10.

## Estructura de carpetas

```
apps/web/src/
├─ app/                       # App Router: rutas finas (guards + screens)
│  ├─ layout.tsx              # raíz: fuentes, lang="es", metadata, providers
│  ├─ login/page.tsx          # única pantalla pública (sin sidebar)
│  └─ (app)/                  # shell privado: RequireAuth + sidebar + topbar
│     ├─ page.tsx             # dashboard rol-aware
│     ├─ materiales/ ubicaciones/ maquinas/ trabajadores/   # catálogos
│     ├─ recetas/ (lista, nueva/, [id]/)                    # builder de pasos
│     ├─ asignaciones/ produccion/ (lista, nueva/, registrar/)
│     ├─ suministros/arribo/ stock/ trazabilidad/ eventos/
├─ components/
│  ├─ ui/                     # primitivas shadcn/ui
│  ├─ shared/                 # DataTable, ConfirmDialog, FormDialog, …
│  ├─ guards.tsx              # RequireAuth / RequireRole
│  └─ <módulo>/               # lógica de cada pantalla (catalogs, recipes,
│                             #  assignments, production, stock, trace, events…)
├─ lib/
│  ├─ api/
│  │  ├─ client.ts            # axios + interceptores (Bearer, refresh single-flight)
│  │  ├─ types.ts             # wire DTOs (espejo de los serializadores de la API)
│  │  ├─ errors.ts            # ApiError + errorToMessage() (español)
│  │  └─ modules/             # authApi, materialsApi, … batchEventsApi (por recurso)
│  ├─ session/session-store.ts # sessionStorage (tokens) + SessionProvider/useSession
│  ├─ format/                 # cantidades, fechas, unidades, días, ids, labels
│  ├─ hooks/                  # useApiQuery, useErrorToast
│  └─ nav.ts                  # matriz de navegación por rol
└─ __tests__/                 # vitest + Testing Library (espeja src/)
```

Reglas duras (en docs/10 §Reglas de trabajo): los componentes **nunca** llaman
a axios directo (todo pasa por `lib/api/modules/*`), hooks propios
(`useApiQuery`) en vez de TanStack Query en v1, y español en toda la UI.

## Notas de Next 16

- **Este Next no es el Next de antes.** Antes de tocar código, leer la guía
  correspondiente en `node_modules/next/dist/docs/` — el bloque
  `BEGIN:nextjs-agent-rules` de [`AGENTS.md`](AGENTS.md) lo recuerda y lo
  regenera `next dev`; se commitea junto con el trabajo.
- El shell es **client-rendered** porque los tokens viven en `sessionStorage`
  (no existe en el servidor): decisión en docs/10 §*App shell client-rendered*.
- `next.config.ts` usa `cacheComponents: true` + `partialPrefetching: true`;
  `params` y `searchParams` son promesas (se resuelven con `use()` /
  `useSearchParams` **dentro de `Suspense`**).