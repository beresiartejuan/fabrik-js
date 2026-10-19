import type { WorkerRole } from '@fabrik/domain';
import { type RenderResult, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AsignacionesPage from '@/app/(app)/asignaciones/page';
import EventosPage from '@/app/(app)/eventos/page';
import MaquinasPage from '@/app/(app)/maquinas/page';
import MaterialesPage from '@/app/(app)/materiales/page';
import DashboardPage from '@/app/(app)/page';
import NuevaProduccionPage from '@/app/(app)/produccion/nueva/page';
import ProduccionPage from '@/app/(app)/produccion/page';
import RegistrarPage from '@/app/(app)/produccion/registrar/page';
import NuevaRecetaPage from '@/app/(app)/recetas/nueva/page';
import RecetasPage from '@/app/(app)/recetas/page';
import StockPage from '@/app/(app)/stock/page';
import ArriboPage from '@/app/(app)/suministros/arribo/page';
import TrabajadoresPage from '@/app/(app)/trabajadores/page';
import TrazabilidadPage from '@/app/(app)/trazabilidad/page';
import UbicacionesPage from '@/app/(app)/ubicaciones/page';
import { RecipeEditorScreen } from '@/components/recipes/recipe-editor-screen';
import { navItemsForRole } from '@/lib/nav';
import { makeBatch, makeRecipe, makeTransformation } from '../helpers/fixtures';
import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Recorrido por rol (criterio de salida de Fase 7): **matriz compacta de smoke
 * renders** — para cada rol se montan las *rutas reales* de su navegación
 * (`navItemsForRole`) con la capa de API mockeada (promesas resueltas con
 * listados vacíos / fixtures mínimos) y se espera que la pantalla aterrice con
 * su encabezado y sin redirect indevido. Flujos completos, estados y errores
 * se testean en las suites de cada pantalla; las guardas ya tienen sus tests
 * de redirect en `production/routes-guards.test.tsx`,
 * `trace/trace-routes-guards.test.tsx` y `journeys/forbidden-redirects.test.tsx`.
 */

const { mocks, replace } = vi.hoisted(() => ({
  mocks: {
    authApi: { me: vi.fn(), login: vi.fn(), logout: vi.fn() },
    meApi: { schedule: vi.fn() },
    materialsApi: { list: vi.fn() },
    locationsApi: { list: vi.fn() },
    machinesApi: { list: vi.fn() },
    workersApi: { list: vi.fn() },
    recipesApi: { list: vi.fn(), get: vi.fn() },
    assignmentsApi: {
      assign: vi.fn(),
      unassign: vi.fn(),
      workerSchedule: vi.fn(),
      machineSchedule: vi.fn(),
    },
    batchesApi: { list: vi.fn(), get: vi.fn() },
    batchEventsApi: { list: vi.fn() },
    productionApi: { start: vi.fn(), transform: vi.fn(), store: vi.fn(), complete: vi.fn() },
    suppliesApi: { arrive: vi.fn() },
    stockApi: { byLocation: vi.fn(), movements: vi.fn() },
    traceApi: { backward: vi.fn(), forward: vi.fn() },
  },
  replace: vi.fn(),
}));

// La capa de API es mockeada como módulos (patron estable del repo, ver
// `helpers/README.md`); next/navigation se mockea para los guards y el
// deep-link de trazabilidad.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/api/modules/authApi', () => ({ authApi: mocks.authApi }));
vi.mock('@/lib/api/modules/meApi', () => ({ meApi: mocks.meApi }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/locationsApi', () => ({ locationsApi: mocks.locationsApi }));
vi.mock('@/lib/api/modules/machinesApi', () => ({ machinesApi: mocks.machinesApi }));
vi.mock('@/lib/api/modules/workersApi', () => ({ workersApi: mocks.workersApi }));
vi.mock('@/lib/api/modules/recipesApi', () => ({ recipesApi: mocks.recipesApi }));
vi.mock('@/lib/api/modules/assignmentsApi', () => ({ assignmentsApi: mocks.assignmentsApi }));
vi.mock('@/lib/api/modules/batchesApi', () => ({ batchesApi: mocks.batchesApi }));
vi.mock('@/lib/api/modules/batchEventsApi', () => ({ batchEventsApi: mocks.batchEventsApi }));
vi.mock('@/lib/api/modules/productionApi', () => ({ productionApi: mocks.productionApi }));
vi.mock('@/lib/api/modules/suppliesApi', () => ({ suppliesApi: mocks.suppliesApi }));
vi.mock('@/lib/api/modules/stockApi', () => ({ stockApi: mocks.stockApi }));
vi.mock('@/lib/api/modules/traceApi', () => ({ traceApi: mocks.traceApi }));

/** El dashboard `/` cambia su encabezado según el rol. */
const DASHBOARD_TITLES: Record<WorkerRole, string> = {
  admin: 'Panel',
  worker: 'Mi jornada',
  auditor: 'Panel de auditoría',
};

/** Rutas estáticas de la navegación → nodo a montar + encabezado esperado. */
const PAGES: Record<string, { node: ReactNode; title: string }> = {
  '/materiales': { node: <MaterialesPage />, title: 'Materiales' },
  '/ubicaciones': { node: <UbicacionesPage />, title: 'Ubicaciones' },
  '/maquinas': { node: <MaquinasPage />, title: 'Máquinas' },
  '/trabajadores': { node: <TrabajadoresPage />, title: 'Trabajadores' },
  '/recetas': { node: <RecetasPage />, title: 'Recetas' },
  '/recetas/nueva': { node: <NuevaRecetaPage />, title: 'Nueva receta' },
  '/asignaciones': { node: <AsignacionesPage />, title: 'Asignaciones' },
  '/produccion': { node: <ProduccionPage />, title: 'Producción' },
  '/produccion/nueva': { node: <NuevaProduccionPage />, title: 'Nueva producción' },
  '/produccion/registrar': { node: <RegistrarPage />, title: 'Registrar transformación' },
  '/suministros/arribo': { node: <ArriboPage />, title: 'Arribo de suministros' },
  '/stock': { node: <StockPage />, title: 'Stock' },
  '/trazabilidad': { node: <TrazabilidadPage />, title: 'Trazabilidad' },
  '/eventos': { node: <EventosPage />, title: 'Eventos' },
};

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
  // Todo resuelve «vacío» (el estado vacío también es parte del recorrido) y
  // los get/comportados devuelven fixtures mínimos donde se espera un objeto.
  for (const api of Object.values(mocks)) {
    for (const mock of Object.values(api)) {
      mock.mockReset();
      mock.mockResolvedValue([]);
    }
  }
  mocks.recipesApi.get.mockResolvedValue(makeRecipe());
  mocks.batchesApi.get.mockResolvedValue(makeBatch());
  mocks.productionApi.start.mockResolvedValue(makeBatch());
  mocks.productionApi.transform.mockResolvedValue(makeTransformation());
  mocks.productionApi.store.mockResolvedValue(makeBatch({ status: 'stored' }));
  mocks.productionApi.complete.mockResolvedValue(makeBatch({ status: 'completed' }));
});

/** Monta una ruta del recorrido para el rol y espera su encabezado. */
async function smoke(
  role: WorkerRole,
  entry: { node: ReactNode; title: string },
): Promise<RenderResult> {
  seedSessionRole(role);
  const view = renderWithSession(entry.node);
  expect(await screen.findByRole('heading', { level: 1, name: entry.title })).toBeInTheDocument();
  // Nunca hay un redirect indevido en una ruta permitida al rol (guardas).
  await waitFor(() => expect(replace).not.toHaveBeenCalled());
  return view;
}

describe('recorrido por rol: cada pantalla habilitada monta sin error', () => {
  for (const role of ['admin', 'worker', 'auditor'] as const) {
    it(`el ${role} aterriza en cada ruta de su navegación`, async () => {
      for (const item of navItemsForRole(role)) {
        const entry =
          item.href === '/'
            ? { node: <DashboardPage />, title: DASHBOARD_TITLES[role] }
            : PAGES[item.href];
        expect(entry, `La ruta ${item.href} no está contemplada en el recorrido.`).toBeDefined();
        const view = await smoke(role, entry);
        view.unmount();
      }
    });
  }

  it('el admin aterriza también en la receta en modo edición (pantalla de recetas/detalle)', async () => {
    // La página (`guard` + `Suspense` con `useSearchParams`) ya está cubierta
    // por los tests de guardas y por `recipes/recetas-detalle.test`; acá se
    // monta la pantalla de edición con el id resuelto del query param.
    const view = await smoke('admin', {
      node: <RecipeEditorScreen recipeId="r-1" canWrite />,
      title: 'Editar receta',
    });
    await waitFor(() => expect(mocks.recipesApi.get).toHaveBeenCalledWith('r-1'));
    view.unmount();
  });
});
