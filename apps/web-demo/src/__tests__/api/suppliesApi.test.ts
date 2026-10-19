import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { loadDb, resetDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createSuppliesApi } from '@/lib/api/modules/suppliesApi';
import { writeTokens } from '@/lib/session/session-store';

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

/**
 * Contrato de `suppliesApi` sobre el runtime DEMO (docs/demo.md §T4b),
 * espejo del `SuppliesController` (`apps/api/src/supplies/supplies.controller.ts`):
 * registrar el arribo con `{ materialId, quantity: { amount, unit }, locationId }`
 * crea el lote `stored` + el `StockMovement` `supply_in` y responde el **lote
 * creado**. Los casos de uso son los reales del registro (`demo/registry.ts`),
 * así que las reglas de dominio (material `supply`, lugar `storage`, unidad I6)
 * producen los mismos 404/403/422 que el `DomainExceptionFilter` del API.
 *
 * Cada operación corre contra la base del demo con el **histórico ya sembrado**
 * (`ensureDemoContext` corre `ensureHistorySeeded` en la primera llamada): 5
 * lotes / 2 eventos / 7 movimientos, sobre los que se afirma el delta del nuevo
 * arribo.
 */

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

describe('supplies: contrato de API (runtime demo)', () => {
  it('arrive crea el lote `stored` + el movimiento `supply_in` y responde el lote creado', async () => {
    loginAs(DEMO_SEED_IDS.admin);
    const api = createSuppliesApi();

    const batch = await api.arrive({
      materialId: DEMO_SEED_IDS.harina,
      quantity: { amount: 250, unit: 'kg' },
      locationId: DEMO_SEED_IDS.almacen,
    });

    expect(typeof batch.id).toBe('string');
    expect(batch.id.length).toBeGreaterThan(0);
    expect(batch).toMatchObject({
      materialId: DEMO_SEED_IDS.harina,
      quantity: { amount: 250, unit: 'kg' },
      status: 'stored',
    });
    // Campos opcionales omitidos: el lote de suministro no lleva receta ni origen.
    expect('recipeId' in batch).toBe(false);
    expect('originBatchEventId' in batch).toBe(false);

    // Persistido: histórico (5 lotes) + el nuevo arribo, y el movimiento `supply_in`.
    const data = loadDb();
    expect(data.batches).toHaveLength(6);
    expect(data.batches.find((candidate) => candidate.id === batch.id)).toMatchObject({
      materialId: DEMO_SEED_IDS.harina,
      quantity: { amount: 250, unit: 'kg' },
      status: 'stored',
    });
    expect(data.stockMovements).toHaveLength(8); // 7 del histórico + supply_in
    const movement = data.stockMovements[data.stockMovements.length - 1];
    expect(movement).toMatchObject({
      locationId: DEMO_SEED_IDS.almacen,
      materialId: DEMO_SEED_IDS.harina,
      delta: { amount: 250, unit: 'kg' },
      reason: 'supply_in',
    });
    expect('batchEventId' in movement).toBe(false); // supply_in no cuelga de un evento
  });

  it('arrive es A/W: el auditor recibe 403', async () => {
    loginAs(DEMO_SEED_IDS.auditor);

    const failure = await failureOf(
      createSuppliesApi().arrive({
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 1, unit: 'kg' },
        locationId: DEMO_SEED_IDS.almacen,
      }),
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(403);
    expect(failure.error).toBe('UnauthorizedRoleError');
    expect(failure.context).toStrictEqual({ role: 'auditor', useCase: 'RegisterSupplyArrival' });
  });

  it('arrive mapea 404 (material o lugar desconocidos) y 422 (material no suministro, unidad I6, lugar no storage)', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    const api = createSuppliesApi();

    const unknownMaterial = await failureOf(
      api.arrive({
        materialId: 'mat-faltante',
        quantity: { amount: 1, unit: 'kg' },
        locationId: DEMO_SEED_IDS.almacen,
      }),
    );
    expect(unknownMaterial.statusCode).toBe(404);
    expect(unknownMaterial.error).toBe('NotFoundError');
    expect(unknownMaterial.context).toStrictEqual({ entity: 'Material', id: 'mat-faltante' });

    const unknownLocation = await failureOf(
      api.arrive({
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 1, unit: 'kg' },
        locationId: 'loc-faltante',
      }),
    );
    expect(unknownLocation.statusCode).toBe(404);
    expect(unknownLocation.error).toBe('NotFoundError');
    expect(unknownLocation.context).toStrictEqual({ entity: 'Location', id: 'loc-faltante' });

    // El pan es producto, no suministro → 422 con contexto (MaterialKindMismatch).
    const kindMismatch = await failureOf(
      api.arrive({
        materialId: DEMO_SEED_IDS.pan,
        quantity: { amount: 1, unit: 'unit' },
        locationId: DEMO_SEED_IDS.almacen,
      }),
    );
    expect(kindMismatch.statusCode).toBe(422);
    expect(kindMismatch.error).toBe('MaterialKindMismatchError');
    expect(kindMismatch.context).toStrictEqual({
      expected: 'supply',
      materialId: DEMO_SEED_IDS.pan,
      received: 'product',
    });

    // Unidad incompatible con la del material (I6) → 422.
    const incompatibleUnit = await failureOf(
      api.arrive({
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 1, unit: 'l' },
        locationId: DEMO_SEED_IDS.almacen,
      }),
    );
    expect(incompatibleUnit.statusCode).toBe(422);
    expect(incompatibleUnit.error).toBe('IncompatibleUnitError');

    // El lugar de producción no admite arribos → 422 (InvalidLocationKind).
    const invalidLocationKind = await failureOf(
      api.arrive({
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 1, unit: 'kg' },
        locationId: DEMO_SEED_IDS.produccion,
      }),
    );
    expect(invalidLocationKind.statusCode).toBe(422);
    expect(invalidLocationKind.error).toBe('InvalidLocationKindError');
  });

  it('sin sesión activa la operación falla con 401 (token leído por llamada)', async () => {
    const failure = await failureOf(
      createSuppliesApi().arrive({
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 1, unit: 'kg' },
        locationId: DEMO_SEED_IDS.almacen,
      }),
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
    expect(failure.isNetworkError).toBe(false);
  });
});
