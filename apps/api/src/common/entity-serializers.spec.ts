import { Quantity, TimeSlot } from '@fabrik/domain';
import { describe, expect, it } from 'vitest';

import { serializeQuantity, serializeTimeSlot } from './entity-serializers.js';

/**
 * Los serializadores son explícitos (lista blanca) porque `TimeSlot` guarda
 * `startMinutes`/`endMinutes` como propiedades propias: un `{ ...slot }` los
 * filtraría al wire. Este test fija ese contrato.
 */
describe('entity serializers', () => {
  it('serializeTimeSlot expone solo daysOfWeek/start/end (sin minutos internos)', () => {
    const serialized = serializeTimeSlot(TimeSlot.create([5, 1], '08:00', '16:30'));
    expect(serialized).toEqual({ daysOfWeek: [1, 5], start: '08:00', end: '16:30' });
    expect(Object.keys(serialized)).toEqual(['daysOfWeek', 'start', 'end']);
  });

  it('serializeQuantity expone amount y unit', () => {
    expect(serializeQuantity(Quantity.create(2, 'kg'))).toEqual({ amount: 2, unit: 'kg' });
  });
});
