import { and, eq, isNull } from 'drizzle-orm';
import { WorkerId } from '@fabrik/domain';

import type { Executor } from '../persistence/executor.js';
import { refreshTokens, type RefreshTokenRow } from '../persistence/schema.js';

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
  /** Revoca un token concreto (rotación). Idempotente. */
  revoke(id: string, at: Date): Promise<void>;
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

  async revoke(id: string, at: Date): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForWorker(workerId: WorkerId, at: Date): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(refreshTokens.workerId, workerId), isNull(refreshTokens.revokedAt)));
  }
}
