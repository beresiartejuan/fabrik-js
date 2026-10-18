import { describe, expect, it } from 'vitest';
import {
  batchQuantitiesSummary,
  capEventsToDisplay,
  EMPTY_EVENT_FILTERS,
  EVENTS_DISPLAY_LIMIT,
  hasEventFilters,
  toEventQuery,
  toIsoOrNull,
} from '@/components/events/events-state';
import type { BatchEventWire, BatchQuantityWire } from '@/lib/api/types';

/**
 * Estado puro de los filtros de `/eventos` (Fase 6): `datetime-local` → ISO con
 * offset (la API valida `z.iso.datetime({ offset: true })`), map del borrador a
 * los params de `GET /batch-events`, recorte en cliente y resúmenes de la tabla.
 */
describe('toIsoOrNull', () => {
  it('convierte un valor de datetime-local a ISO con offset (UTC explícito)', () => {
    expect(toIsoOrNull('2026-10-17T12:30')).toBe(new Date('2026-10-17T12:30').toISOString());
    expect(toIsoOrNull('2026-10-17T12:30')).toMatch(/Z$/);
  });

  it('vacío o inválido devuelven null (el filtro se omite)', () => {
    expect(toIsoOrNull('')).toBeNull();
    expect(toIsoOrNull('   ')).toBeNull();
    expect(toIsoOrNull('no.es.fecha')).toBeNull();
  });
});

describe('toEventQuery', () => {
  it('sin filtros devuelve un objeto vacío (sin query params)', () => {
    expect(toEventQuery(EMPTY_EVENT_FILTERS)).toEqual({});
  });

  it('mapea solo los filtros con valor y convierte el rango a ISO', () => {
    expect(
      toEventQuery({
        machineId: ' machine-1 ',
        workerId: '',
        materialId: 'material-1',
        from: '2026-10-01T10:00',
        to: '2026-10-31T22:30',
      }),
    ).toEqual({
      machineId: 'machine-1',
      materialId: 'material-1',
      from: new Date('2026-10-01T10:00').toISOString(),
      to: new Date('2026-10-31T22:30').toISOString(),
    });
  });

  it('un rango inválido no viaja en la query', () => {
    const query = toEventQuery({ ...EMPTY_EVENT_FILTERS, from: 'ayer', to: '2026-10-31T22:30' });
    expect(query).toEqual({ to: new Date('2026-10-31T22:30').toISOString() });
  });
});

describe('hasEventFilters', () => {
  it('detecta solo cuando hay algo aplicado', () => {
    expect(hasEventFilters(EMPTY_EVENT_FILTERS)).toBe(false);
    expect(hasEventFilters({ ...EMPTY_EVENT_FILTERS, workerId: 'worker-1' })).toBe(true);
    expect(hasEventFilters({ ...EMPTY_EVENT_FILTERS, from: '2026-10-01T10:00' })).toBe(true);
  });
});

describe('capEventsToDisplay (gap: la API no pagina)', () => {
  function makeEvent(id: string): BatchEventWire {
    return {
      id,
      machineId: 'machine-1',
      workerId: 'worker-1',
      locationId: 'location-1',
      inputs: [],
      outputs: [],
      timestamp: new Date(Date.parse('2026-10-01T10:00:00.000Z') + Number(id)).toISOString(),
    };
  }

  it('no recorta debajo del límite', () => {
    const events = Array.from({ length: EVENTS_DISPLAY_LIMIT }, (_, i) => makeEvent(String(i)));
    const result = capEventsToDisplay(events);
    expect(result.capped).toBe(false);
    expect(result.visible).toEqual(events);
    expect(result.total).toBe(EVENTS_DISPLAY_LIMIT);
  });

  it('recorta a los últimos N conservando la cola (los más recientes) y reporta el total', () => {
    const events = Array.from({ length: EVENTS_DISPLAY_LIMIT + 37 }, (_, i) =>
      makeEvent(String(i)),
    );
    const result = capEventsToDisplay(events);
    expect(result.capped).toBe(true);
    expect(result.total).toBe(EVENTS_DISPLAY_LIMIT + 37);
    expect(result.visible).toHaveLength(EVENTS_DISPLAY_LIMIT);
    // Ascendente: la cola del arreglo son los eventos más nuevos.
    expect(result.visible[0]).toEqual(events[37]);
    expect(result.visible[result.visible.length - 1]).toEqual(events[events.length - 1]);
  });
});

describe('batchQuantitiesSummary', () => {
  it('cuenta y lista los materiales resueltos', () => {
    const items: BatchQuantityWire[] = [
      { materialId: 'm-harina', quantity: { amount: 5, unit: 'kg' } },
      { materialId: 'm-agua', quantity: { amount: 2, unit: 'l' } },
    ];
    expect(batchQuantitiesSummary(items, (id) => (id === 'm-harina' ? 'Harina 000' : 'Agua'))).toBe(
      '2 · Harina 000, Agua',
    );
  });

  it('sin filas muestra un guion', () => {
    expect(batchQuantitiesSummary([], () => 'x')).toBe('—');
  });
});
