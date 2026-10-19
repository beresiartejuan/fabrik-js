import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEMO_DB_SCHEMA_VERSION,
  DEMO_DB_STORAGE_KEY,
  type DemoData,
  loadDb,
  readRaw,
  resetDb,
  saveDb,
} from '@/lib/api/demo/db';
import { buildSeed } from '@/lib/api/demo/seed';

/**
 * Base demo sobre `sessionStorage` (jsdom la expone): seed transparente,
 * roundtrip y tolerancia a estado inválido (nunca debe tumbar la demo).
 */

const SEED = (): DemoData => buildSeed();

/** Material extra para probar mutaciones de escritura sobre el seed. */
const EXTRA_MATERIAL = {
  id: 'mat-levadura',
  name: 'Levadura',
  description: 'Suministro extra de test',
  kind: 'supply',
  physicalState: 'solid',
  unitOfMeasure: 'g',
  active: true,
} as const;

function dataWithExtraMaterial(): DemoData {
  const data = loadDb();
  return { ...data, materials: [...data.materials, { ...EXTRA_MATERIAL }] };
}

describe('demo db (sessionStorage)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    // `savedAt` queda determinista para los asserts de roundtrip de abajo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loadDb siembra de forma transparente en el primer acceso', () => {
    expect(window.sessionStorage.getItem(DEMO_DB_STORAGE_KEY)).toBeNull();

    const first = loadDb();
    expect(first).toEqual(SEED());
    // El sobre quedó persistido con el sello del reloj (fakeado).
    expect(readRaw()).toMatchObject({
      schemaVersion: DEMO_DB_SCHEMA_VERSION,
      savedAt: '2026-06-01T10:00:00.000Z',
    });
    // Segunda lectura estable: ya no resembra ni cambia el resultado.
    expect(loadDb()).toEqual(first);
    expect(readRaw()?.savedAt).toBe('2026-06-01T10:00:00.000Z');
  });

  it('loadDb devuelve un clon profundo: mutar lo leído no corrompe el storage', () => {
    const data = loadDb();
    (data.users[0] as { name: string }).name = 'trastocado';
    delete (data as { users?: unknown }).users;

    const reloaded = loadDb();
    expect(reloaded).toEqual(SEED());
    expect(reloaded.users[0]?.name).toBe('admin');
  });

  it('saveDb: roundtrip completo (mutar → guardar → recargar refleja los cambios)', () => {
    loadDb(); // asegura el seed en storage
    const before = readRaw();
    expect(before?.data.materials).toHaveLength(4);

    vi.setSystemTime(new Date('2026-06-01T10:05:00.000Z'));
    saveDb(dataWithExtraMaterial());

    const reloaded = loadDb();
    expect(reloaded.materials).toHaveLength(5);
    expect(reloaded.materials[4]).toEqual(EXTRA_MATERIAL);
    // El sobre se re-sella en cada guardado.
    expect(readRaw()?.savedAt).not.toBe(before?.savedAt);
    expect(readRaw()?.savedAt).toBe('2026-06-01T10:05:00.000Z');
    // El resto de colecciones sigue intacto tras el write-through.
    expect(reloaded.machines).toEqual(SEED().machines);
    expect(reloaded.users).toEqual(SEED().users);
  });

  it('saveDb clona en profundidad: mutar el objeto guardado después no altera el storage', () => {
    loadDb();
    const toSave = dataWithExtraMaterial();
    saveDb(toSave);

    (toSave.materials[4] as { name: string }).name = 'trastocado';
    delete (toSave as { materials?: unknown }).materials;

    const reloaded = loadDb();
    expect(reloaded.materials).toHaveLength(5);
    expect(reloaded.materials[4].name).toBe('Levadura');
  });

  it('JSON corrupto → descarta y resembra', () => {
    window.sessionStorage.setItem(DEMO_DB_STORAGE_KEY, '{"schemaVersion": 1, "data"');

    const reseeded = loadDb();
    expect(reseeded).toEqual(SEED());
    // El storage volvió a quedar en un estado válido.
    expect(readRaw()?.schemaVersion).toBe(DEMO_DB_SCHEMA_VERSION);
    expect(readRaw()?.data).toEqual(SEED());
  });

  it('schemaVersion distinta → descarta y resembra', () => {
    window.sessionStorage.setItem(
      DEMO_DB_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: DEMO_DB_SCHEMA_VERSION + 999,
        savedAt: new Date().toISOString(),
        data: { users: [], workers: [] },
      }),
    );

    const reseeded = loadDb();
    expect(reseeded).toEqual(SEED());
    expect(readRaw()?.schemaVersion).toBe(DEMO_DB_SCHEMA_VERSION);
  });

  it('data con colecciones ausentes → descarta y resembra', () => {
    window.sessionStorage.setItem(
      DEMO_DB_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: DEMO_DB_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        data: { users: [{ id: 'usr-fantasma', name: 'x', password: 'x', role: 'admin' }] },
      }),
    );

    const reseeded = loadDb();
    expect(reseeded).toEqual(SEED());
    expect(reseeded.users).toHaveLength(3);
  });

  it('resetDb vuelve al estado de fábrica inmediatamente', () => {
    loadDb();
    vi.setSystemTime(new Date('2026-06-01T10:10:00.000Z'));
    saveDb(dataWithExtraMaterial());
    expect(loadDb().materials).toHaveLength(5);

    resetDb();

    expect(loadDb()).toEqual(SEED());
    expect(loadDb().materials).toHaveLength(4);
    expect(readRaw()?.savedAt).toBe('2026-06-01T10:10:00.000Z');
  });

  it('readRaw no siembra: refleja solo lo realmente persistido', () => {
    expect(readRaw()).toBeNull();
    expect(window.sessionStorage.getItem(DEMO_DB_STORAGE_KEY)).toBeNull();

    loadDb();

    const envelope = readRaw();
    expect(envelope?.schemaVersion).toBe(DEMO_DB_SCHEMA_VERSION);
    expect(envelope?.savedAt).toBeTypeOf('string');
    expect(envelope?.data).toEqual(SEED());
  });

  it('falla con error claro si se usa sin navegador (SSR/prerender)', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(() => loadDb()).toThrow(/sessionStorage/);
      expect(() => saveDb(SEED())).toThrow(/sessionStorage/);
      expect(() => resetDb()).toThrow(/sessionStorage/);
      expect(() => readRaw()).toThrow(/sessionStorage/);
    } finally {
      vi.unstubAllGlobals();
    }
    // La simulación no dejó rastro en el storage real de jsdom.
    expect(window.sessionStorage.getItem(DEMO_DB_STORAGE_KEY)).toBeNull();
  });
});
