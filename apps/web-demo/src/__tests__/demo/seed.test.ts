import { describe, expect, it } from 'vitest';

import { buildSeed, DEMO_SEED_IDS, DEMO_SEED_USERS } from '@/lib/api/demo/seed';

/**
 * El seed del runtime DEMO debe espejar el inventario maestro del seed real de
 * `apps/api/src/persistence/seed.ts` (docs/09, Fase 7), con ids legibles de demo.
 * Se verifican los invariantes importantes, no cada fila suelta.
 */

describe('seed del runtime demo', () => {
  it('crea exactamente 3 usuarios con roles y credenciales planas', () => {
    const seed = buildSeed();
    expect(seed.users).toEqual([
      { id: 'usr-admin', name: 'admin', password: 'admin', role: 'admin' },
      { id: 'usr-operario', name: 'operario', password: 'operario', role: 'worker' },
      { id: 'usr-auditor', name: 'auditor', password: 'auditor', role: 'auditor' },
    ]);
    // Contraseña en claro == nombre de usuario (el auth demo compara planamente).
    for (const user of seed.users) {
      expect(user.password).toBe(user.name);
    }
  });

  it('los users son a la vez los workers (misma identidad que la API real)', () => {
    const seed = buildSeed();
    expect(seed.workers).toEqual(
      seed.users.map((user) => ({ id: user.id, name: user.name, role: user.role, active: true })),
    );
    expect(seed.workers.map((worker) => worker.id).sort()).toEqual(
      seed.users.map((user) => user.id).sort(),
    );
  });

  it('espeja el inventario maestro del seed de apps/api', () => {
    const seed = buildSeed();
    // 1 almacén + 1 planta · 2 suministros + 1 intermedio + 1 producto final ·
    // 1 máquina · 1 receta de 2 pasos · 3 usuarios · 1 asignación full-day.
    expect(seed.locations).toHaveLength(2);
    expect(seed.materials).toHaveLength(4);
    expect(seed.machines).toHaveLength(1);
    expect(seed.recipes).toHaveLength(1);
    expect(seed.recipes[0].steps).toHaveLength(2);
    expect(seed.workers).toHaveLength(3);
    expect(seed.assignments).toHaveLength(1);
  });

  it('materiales coherentes con el flujo de docs/03 (unidad ↔ estado físico)', () => {
    const materials = new Map(buildSeed().materials.map((material) => [material.id, material]));

    expect(materials.get(DEMO_SEED_IDS.harina)).toEqual({
      id: 'mat-harina',
      name: 'Harina',
      description: 'Suministro de demo',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
      active: true,
    });
    expect(materials.get(DEMO_SEED_IDS.agua)).toMatchObject({
      kind: 'supply',
      physicalState: 'liquid',
      unitOfMeasure: 'l',
      active: true,
    });
    expect(materials.get(DEMO_SEED_IDS.masa)).toMatchObject({
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
      active: true,
    });
    expect(materials.get(DEMO_SEED_IDS.pan)).toMatchObject({
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'unit',
      active: true,
    });
  });

  it('la receta encadena docs/03: harina + agua → masa → pan (posiciones e I7)', () => {
    const recipe = buildSeed().recipes[0];

    expect(recipe.name).toBe('Pan artesanal');
    expect(recipe.outputProductId).toBe(DEMO_SEED_IDS.pan);
    expect(recipe.outputQuantity).toEqual({ amount: 1, unit: 'unit' });
    expect(recipe.steps.map((step) => step.position)).toEqual([1, 2]);

    const [paso1, paso2] = recipe.steps;
    expect(paso1.inputs).toEqual([
      { materialId: DEMO_SEED_IDS.harina, quantity: { amount: 2, unit: 'kg' } },
      { materialId: DEMO_SEED_IDS.agua, quantity: { amount: 1, unit: 'l' } },
    ]);
    expect(paso1.outputProductId).toBe(DEMO_SEED_IDS.masa);
    expect(paso1.outputQuantity).toEqual({ amount: 2, unit: 'kg' });

    expect(paso2.inputs).toEqual([
      { materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } },
    ]);
    expect(paso2.outputProductId).toBe(DEMO_SEED_IDS.pan);
    // I7: el output del último paso coincide con el output del agregado.
    expect(paso2.outputQuantity).toEqual(recipe.outputQuantity);
  });

  it('la máquina está en la planta de producción con tipo habilitante para los pasos', () => {
    const [machine] = buildSeed().machines;
    expect(machine.type).toBe('mixer');
    expect(machine.status).toBe('idle');
    expect(machine.locationId).toBe(DEMO_SEED_IDS.produccion);
    for (const step of buildSeed().recipes[0].steps) {
      expect(step.machineType).toBe('mixer');
    }
  });

  it('la asignación cubre el día completo (00:00–24:00) todos los días: I3 siempre vigente', () => {
    const [assignment] = buildSeed().assignments;
    expect(assignment.workerId).toBe(DEMO_SEED_IDS.operario);
    expect(assignment.machineId).toBe(DEMO_SEED_IDS.mezcladora);
    // DaysOfWeek completos y franja que cubre 1440 minutos (el dominio acepta
    // '24:00' como fin de jornada, igual que el seed real de apps/api).
    expect(assignment.slot.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(assignment.slot.start).toBe('00:00');
    expect(assignment.slot.end).toBe('24:00');
  });

  it('no siembra histórico: use cases posteriores llenan lotes/eventos/movimientos', () => {
    const seed = buildSeed();
    expect(seed.batches).toEqual([]);
    expect(seed.batchEvents).toEqual([]);
    expect(seed.stockMovements).toEqual([]);
  });

  it('el seed es referencialmente íntegro: no hay ids huérfanos', () => {
    const seed = buildSeed();
    const locationIds = new Set(seed.locations.map((location) => location.id));
    const materialIds = new Set(seed.materials.map((material) => material.id));
    const workerIds = new Set(seed.workers.map((worker) => worker.id));
    const machineIds = new Set(seed.machines.map((machine) => machine.id));

    for (const machine of seed.machines) {
      expect(locationIds.has(machine.locationId)).toBe(true);
    }
    for (const recipe of seed.recipes) {
      expect(materialIds.has(recipe.outputProductId)).toBe(true);
      for (const step of recipe.steps) {
        expect(materialIds.has(step.outputProductId)).toBe(true);
        for (const input of step.inputs) {
          expect(materialIds.has(input.materialId)).toBe(true);
        }
      }
    }
    for (const assignment of seed.assignments) {
      expect(workerIds.has(assignment.workerId)).toBe(true);
      expect(machineIds.has(assignment.machineId)).toBe(true);
    }
  });

  it('los ids son únicos dentro de cada colección (pasos incluidos)', () => {
    const seed = buildSeed();
    const uniques = (rows: readonly { readonly id: string }[]): number =>
      new Set(rows.map((row) => row.id)).size;

    expect(uniques(seed.users)).toBe(seed.users.length);
    expect(uniques(seed.workers)).toBe(seed.workers.length);
    expect(uniques(seed.locations)).toBe(seed.locations.length);
    expect(uniques(seed.materials)).toBe(seed.materials.length);
    expect(uniques(seed.machines)).toBe(seed.machines.length);
    expect(uniques(seed.recipes)).toBe(seed.recipes.length);
    expect(uniques(seed.assignments)).toBe(seed.assignments.length);

    const stepIds = seed.recipes.flatMap((recipe) => recipe.steps.map((step) => step.id));
    expect(new Set(stepIds).size).toBe(stepIds.length);

    // Ids legibles de demo (no UUID): `*Id.from` del dominio solo castea.
    expect(DEMO_SEED_IDS.admin).toBe(seed.users[0].id);
    for (const user of seed.users) {
      expect(user.id).toMatch(/^usr-/);
    }
  });

  it('determinista: dos builds son equivalentes en profundo y byte a byte', () => {
    const first = buildSeed();
    const second = buildSeed();
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // Nada comparte referencias entre builds (cada uno es un objeto nuevo).
    expect(first.users[0]).not.toBe(second.users[0]);
    expect(first.recipes[0].steps[0]).not.toBe(second.recipes[0].steps[0]);
  });

  it('exporta los mismos usuarios que siembra (fuente única para scripts/tests)', () => {
    expect(DEMO_SEED_USERS).toEqual(buildSeed().users);
  });
});
