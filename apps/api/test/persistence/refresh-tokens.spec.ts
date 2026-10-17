import { WorkerId } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DrizzleRefreshTokenRepository,
  type RefreshTokenRecord,
} from '../../src/auth/refresh-token.repository.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

/**
 * Verifica el compare-and-swap real de `revoke` contra SQLite (no el doble de
 * unit): el `WHERE revoked_at IS NULL` + `returning` deben dejar que exactamente
 * un request gane la rotación.
 */
describe('DrizzleRefreshTokenRepository (CAS de revoke)', () => {
  let ctx: TestDatabase;
  let repo: DrizzleRefreshTokenRepository;

  beforeEach(async () => {
    ctx = await createTestDatabase();
    repo = new DrizzleRefreshTokenRepository(ctx.db);
  });

  afterEach(async () => {
    await ctx.close();
  });

  function record(id: string, workerId: WorkerId): RefreshTokenRecord {
    return {
      id,
      workerId,
      tokenHash: `hash-${id}`,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    };
  }

  it('revoke solo gana una vez: el segundo intento devuelve false', async () => {
    const workerId = WorkerId.create();
    await repo.save(record('jti-1', workerId));

    expect(await repo.revoke('jti-1', new Date())).toBe(true);
    expect(await repo.revoke('jti-1', new Date())).toBe(false);
  });

  it('revokes concurrentes del mismo token: exactamente uno gana', async () => {
    const workerId = WorkerId.create();
    await repo.save(record('jti-2', workerId));

    const results = await Promise.all([
      repo.revoke('jti-2', new Date()),
      repo.revoke('jti-2', new Date()),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('revoke de un id inexistente devuelve false', async () => {
    expect(await repo.revoke('no-existe', new Date())).toBe(false);
  });
});
