import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { resetDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createStockApi } from '@/lib/api/modules/stockApi';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Contrato de `stockApi` sobre el runtime DEMO (docs/11-plan-demo.md §T4b),
 * espejo del `StockController` (`apps/api/src/stock/stock.controller.ts`):
 * ambos endpoints son casos de uso de lectura —`GetStockByLocation` (A/Au/W) y
 * `GetStockMovements` (A/Au)— así que el RBAC y el 404 de lugar desconocido los
 * impone el dominio, exactamente como en la API.
 *
 * El stock agregado replica la lógica del caso de uso: la unidad sale del
 * **catálogo**, el orden es el de primera aparición del material en los
 * movimientos, se omiten los materiales con delta neto 0 y los amounts pueden
 * ser **negativos** en el lugar de producción (consumos sin entrada previa).
 * Las afirmaciones corren contra el **histórico ya sembrado** (`history.ts`):
 * arribos + transformación en dos pasos + almacenamientos → 7 movimientos.
 */

/**
 * Atrapa el fallo esperado y lo devuelve ya traducido a `ApiError` (el catch
 * del módulo hace `toApiError` al final del borde): la operación que resuelva
 * feliz rompe la espera de forma explícita.
 */
async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const cause: unknown = await promise.catch((error: unknown) => error);
  if (cause instanceof ApiError) {
    return cause;
  }
  throw new Error('la operación debía fallar con ApiError');
}

function loginAs(userId: string): void {
  writeTokens({
    accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`,
    refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${userId}`,
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetDb();
});

describe('stock: contrato de API (runtime demo)', () => {
  it('byLocation agrega por material con signo; omite los netos en cero y ordena por primera aparición', async () => {
    loginAs(DEMO_SEED_IDS.auditor);
    const api = createStockApi();

    const almacen = await api.byLocation(DEMO_SEED_IDS.almacen);
    expect(almacen).toEqual([
      // Arribos (supply_in) + outputs almacenados (produced).
      { materialId: DEMO_SEED_IDS.harina, amount: 2, unit: 'kg' },
      { materialId: DEMO_SEED_IDS.agua, amount: 1, unit: 'l' },
      { materialId: DEMO_SEED_IDS.masa, amount: 2, unit: 'kg' },
      { materialId: DEMO_SEED_IDS.pan, amount: 1, unit: 'unit' },
    ]);

    // En el lugar de producción solo quedan consumos (sin entrada previa):
    // amounts **negativos**, mostrados con signo por la UI.
    const produccion = await api.byLocation(DEMO_SEED_IDS.produccion);
    expect(produccion).toEqual([
      { materialId: DEMO_SEED_IDS.harina, amount: -2, unit: 'kg' },
      { materialId: DEMO_SEED_IDS.agua, amount: -1, unit: 'l' },
      { materialId: DEMO_SEED_IDS.masa, amount: -2, unit: 'kg' },
    ]);
  });

  it('byLocation con lugar desconocido → 404 (GetStockByLocation valida el lugar)', async () => {
    loginAs(DEMO_SEED_IDS.admin);

    const failure = await failureOf(createStockApi().byLocation('loc-faltante'));

    expect(failure.statusCode).toBe(404);
    expect(failure.error).toBe('NotFoundError');
    expect(failure.context).toStrictEqual({ entity: 'Location', id: 'loc-faltante' });
  });

  it('movements devuelve el historial ascendente del lugar con el wire exacto', async () => {
    loginAs(DEMO_SEED_IDS.auditor);

    const movements = await createStockApi().movements(DEMO_SEED_IDS.almacen);

    // Cronológico ascendente: 2 arribos + 2 almacenamientos ('produced').
    expect(movements.map((movement) => movement.reason)).toEqual([
      'supply_in',
      'supply_in',
      'produced',
      'produced',
    ]);
    const times = movements.map((movement) => new Date(movement.timestamp).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(movements[0]).toMatchObject({
      locationId: DEMO_SEED_IDS.almacen,
      materialId: DEMO_SEED_IDS.harina,
      delta: { amount: 2, unit: 'kg' },
    });
    expect(movements[1]).toMatchObject({
      materialId: DEMO_SEED_IDS.agua,
      delta: { amount: 1, unit: 'l' },
    });
    // El supply_in no cuelga de un evento de transformación (campo omitido)...
    expect('batchEventId' in movements[0]).toBe(false);
    expect('batchEventId' in movements[1]).toBe(false);
    // ...y el produced queda vinculado al evento que produjo el lote.
    expect(movements[2].batchEventId).toEqual(expect.any(String));
    expect(movements[3].batchEventId).toEqual(expect.any(String));
  });

  it('movements filtra por material (query opcional, solo viaja si hay filtro)', async () => {
    loginAs(DEMO_SEED_IDS.admin);

    const movements = await createStockApi().movements(DEMO_SEED_IDS.almacen, DEMO_SEED_IDS.harina);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      reason: 'supply_in',
      delta: { amount: 2, unit: 'kg' },
      locationId: DEMO_SEED_IDS.almacen,
    });
  });

  it('movements con lugar desconocido → 404', async () => {
    loginAs(DEMO_SEED_IDS.admin);

    const failure = await failureOf(createStockApi().movements('loc-faltante'));

    expect(failure.statusCode).toBe(404);
    expect(failure.error).toBe('NotFoundError');
    expect(failure.context).toStrictEqual({ entity: 'Location', id: 'loc-faltante' });
  });

  it('RBAC: byLocation es A/Au/W (el worker consulta stock) y movements es A/Au (worker → 403)', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    const api = createStockApi();

    const byLocation = await api.byLocation(DEMO_SEED_IDS.almacen);
    expect(byLocation).toHaveLength(4);

    const failure = await failureOf(api.movements(DEMO_SEED_IDS.almacen));
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(403);
    expect(failure.error).toBe('UnauthorizedRoleError');
    expect(failure.context).toStrictEqual({ role: 'worker', useCase: 'GetStockMovements' });
  });

  it('sin sesión activa la operación falla con 401', async () => {
    const failure = await failureOf(createStockApi().byLocation(DEMO_SEED_IDS.almacen));

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
  });
});
