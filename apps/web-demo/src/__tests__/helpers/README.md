# Helpers de test (`src/__tests__/helpers/`)

Ayudantes compartidos por la suite de `apps/web`. Cada fase solo añade helpers
cuando hay repetición real entre tests; acá vive lo transversal.

## `fixtures.ts` — fábricas de DTOs de wire

Fábricas (`makeMaterial`, `makeLocation`, `makeMachine`, `makeWorker`,
`makeRecipe`/`makeRecipeStep`/`makeMaterialQuantity`, `makeAssignment`/
`makeMeScheduleItem`, `makeBatch`/`makeBatchQuantity`, `makeBatchEvent`,
`makeTransformation`, `makeStockEntry`, `makeStockMovement` y los
constructores anidados `quantity`/`slot`) que producen DTOs tipados de
`@/lib/api/types` listos para las respuestas de los mocks. Defaults
deterministas con ids auto-generados (`loc-01`, `mat-01`, …) y overrides
**a un nivel** (los objetos anidados se reemplazan enteros — use `quantity()`/
`slot()` para construirlos). Ver el comentario de cabecera de ese archivo.

## Mocking de la capa HTTP: no se usa `msw` (decisión)

El plan de Fase 7 decía «`msw` o mock del adaptador axios». El codebase ya
tiene un patrón estable que cumple ese objetivo sin una dependencia nueva,
así que se mantiene:

- **Prácticamente todos los tests de componentes/módulos** mockean el
  **módulo de API tipado** (`lib/api/modules/*`) con `vi.fn()` por método:

  ```ts
  const { mocks } = vi.hoisted(() => ({
    mocks: { materialsApi: { list: vi.fn() } },
  }));
  vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
  ```

  Ese **módulo es el seam del proyecto** (los componentes nunca tocan axios:
  regla 3 del plan), así que mockearlo testea el contrato visible de la UI y
  deja los fixtures de este folder como *single source of truth* de las
  respuestas. Con `msw` se duplicaría el mismo stub a nivel HTTP debajo.

- **El interceptor de axios** (`__tests__/api/client.test.ts`) usa un
  **adaptador custom inyectable** (`createApiClient({ adapter, … })`):
  el `client.ts` está diseñado para testearse a nivel transporte sin red.

- `msw` (service worker) además no aplica en jsdom sin `msw/node` + setup
  global, y traerlo solo para repetir lo que ya aísla el mock de módulos
  añadiría una dependencia y una segunda superficie de mocks a mantener.
  Si en el futuro aparece un test que necesite un servidor HTTP real
  (p. ej. pruebas e2e fuera de alcance v1), se evalúa entonces.

## Otros helpers

- **`session.tsx`**: siembra el rol en `sessionStorage` (`seedSessionRole`) y
  envuelve componentes en el `SessionProvider` (`renderWithSession`).
- **`select.ts`**: hace click y elige opciones del `Select` de shadcn (Base UI)
  en jsdom (`selectOption`/`selectOptionAsync`), que exige
  `pointerdown` + `click`.