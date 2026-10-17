import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('responde { ok: true }', () => {
    expect(new HealthController().check()).toEqual({ ok: true });
  });
});
