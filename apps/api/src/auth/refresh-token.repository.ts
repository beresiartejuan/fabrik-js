import { WorkerId } from '@fabrik/domain';
import { and, eq, isNull } from 'drizzle-orm';

import type { Executor } from '../persistence/executor.js';
import { type RefreshTokenRow, refreshTokens } from '../persistence/schema.js';

/**
 * Refresh token persistido. **Nunca** guarda el token en claro: `tokenHash` es
 * SHA-256 (ver `jwt.ts#hashToken`). El token en claro vive solo en el cliente.
 */
export interface RefreshTokenRecord {
  /** `jti` del JWT: identifica la fila. */
  readonly id: string;
  readonly workerId: WorkerId;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  /** `null` mientras está activo; fecha cuando se rota o se hace logout. */
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

/** Puerto de persistencia de refresh tokens (rotación y logout). */
export interface RefreshTokenRepository {
  save(record: RefreshTokenRecord): Promise<void>;
  findById(id: string): Promise<RefreshTokenRecord | null>;
  /**
   * Revoca un token concreto **con compare-and-swap**: solo pasa `revoked_at` de
   * `NULL` a `at` si seguía vivo. Devuelve `true` si esta llamada fue la que
   * revocó la fila (la ganó en una rotación concurrente), `false` si ya estaba
   * revocada o no existe. Nunca lanza por un segundo `revoke`: es idempotente.
   */
  revoke(id: string, at: Date): Promise<boolean>;
  /** Revoca todos los tokens vivos de un worker (logout). Idempotente. */
  revokeAllForWorker(workerId: WorkerId, at: Date): Promise<void>;
}

function rowToRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    workerId: WorkerId.from(row.workerId),
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

/** Adaptador Drizzle sobre la tabla `refresh_tokens`. */
export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: Executor) {}

  async save(record: RefreshTokenRecord): Promise<void> {
    const row: RefreshTokenRow = {
      id: record.id,
      workerId: record.workerId,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      createdAt: record.createdAt,
    };
    await this.db.insert(refreshTokens).values(row);
  }

  async findById(id: string): Promise<RefreshTokenRecord | null> {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1);
    return rows.length > 0 ? rowToRecord(rows[0]) : null;
  }

  async revoke(id: string, at: Date): Promise<boolean> {
    // `returning` + `isNull(revokedAt)` en el WHERE hacen que solo la primera
    // llamada (la que ve la fila viva) reciba una fila; el resto recibe [].
    const revoked = await this.db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    return revoked.length === 1;
  }

  async revokeAllForWorker(workerId: WorkerId, at: Date): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(refreshTokens.workerId, workerId), isNull(refreshTokens.revokedAt)));
  }
}
