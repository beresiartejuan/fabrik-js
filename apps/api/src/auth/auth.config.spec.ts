import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCESS_TTL_SECONDS,
  DEFAULT_REFRESH_TTL_SECONDS,
  isTestEnvironment,
  resolveAuthConfig,
  TEST_ACCESS_SECRET,
  TEST_REFRESH_SECRET,
} from './auth.config.js';

describe('resolveAuthConfig', () => {
  it('en tests usa secretos por defecto y TTLs sensatos', () => {
    const config = resolveAuthConfig({ NODE_ENV: 'test' });
    expect(config.accessSecret).toBe(TEST_ACCESS_SECRET);
    expect(config.refreshSecret).toBe(TEST_REFRESH_SECRET);
    expect(config.accessTtlSeconds).toBe(DEFAULT_ACCESS_TTL_SECONDS);
    expect(config.refreshTtlSeconds).toBe(DEFAULT_REFRESH_TTL_SECONDS);
    expect(config.bootstrapAdmin).toBeUndefined();
  });

  it('VITEST también se considera entorno de test', () => {
    expect(isTestEnvironment({ VITEST: 'true' })).toBe(true);
    expect(isTestEnvironment({})).toBe(false);
    expect(resolveAuthConfig({ VITEST: 'true' }).accessSecret).toBe(TEST_ACCESS_SECRET);
  });

  it('falla en claro si faltan secretos fuera de tests', () => {
    expect(() => resolveAuthConfig({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => resolveAuthConfig({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a' })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('lee secretos y TTLs del entorno', () => {
    const config = resolveAuthConfig({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: ' access ',
      JWT_REFRESH_SECRET: 'refresh',
      JWT_ACCESS_TTL_SECONDS: '60',
      JWT_REFRESH_TTL_SECONDS: '120',
    });
    expect(config.accessSecret).toBe('access');
    expect(config.refreshSecret).toBe('refresh');
    expect(config.accessTtlSeconds).toBe(60);
    expect(config.refreshTtlSeconds).toBe(120);
  });

  it('rechaza TTLs no positivos', () => {
    expect(() => resolveAuthConfig({ NODE_ENV: 'test', JWT_ACCESS_TTL_SECONDS: '0' })).toThrow(
      /JWT_ACCESS_TTL_SECONDS/,
    );
    expect(() => resolveAuthConfig({ NODE_ENV: 'test', JWT_REFRESH_TTL_SECONDS: 'abc' })).toThrow(
      /JWT_REFRESH_TTL_SECONDS/,
    );
  });

  it('exige nombre y contraseña de bootstrap juntos', () => {
    expect(() => resolveAuthConfig({ NODE_ENV: 'test', BOOTSTRAP_ADMIN_NAME: 'admin' })).toThrow(
      /BOOTSTRAP_ADMIN_NAME/,
    );
    const config = resolveAuthConfig({
      NODE_ENV: 'test',
      BOOTSTRAP_ADMIN_NAME: ' admin ',
      BOOTSTRAP_ADMIN_PASSWORD: 'pwd',
    });
    expect(config.bootstrapAdmin).toEqual({ name: 'admin', password: 'pwd' });
  });
});
