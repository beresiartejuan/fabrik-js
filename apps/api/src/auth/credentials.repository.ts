import { WorkerId } from '@fabrik/domain';
import { eq } from 'drizzle-orm';

import type { Executor } from '../persistence/executor.js';
import { type AuthCredentialRow, authCredentials } from '../persistence/schema.js';

/**
 * Credencial de acceso de un worker (capa API, no dominio). `passwordHash` es el
 * string autocontenido de scrypt (ver `password.ts`); la relación con `workers`
 * es por `workerId` (sin FK, igual que el resto del esquema).
 */
export interface AuthCredential {
  readonly workerId: WorkerId;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Puerto de persistencia de credenciales (implementado por Drizzle). */
export interface CredentialRepository {
  findByWorkerId(workerId: WorkerId): Promise<AuthCredential | null>;
  /** Upsert por `workerId`. */
  save(credential: AuthCredential): Promise<void>;
}

function rowToCredential(row: AuthCredentialRow): AuthCredential {
  return {
    workerId: WorkerId.from(row.workerId),
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adaptador Drizzle sobre la tabla `auth_credentials`. */
export class DrizzleCredentialRepository implements CredentialRepository {
  constructor(private readonly db: Executor) {}

  async findByWorkerId(workerId: WorkerId): Promise<AuthCredential | null> {
    const rows = await this.db
      .select()
      .from(authCredentials)
      .where(eq(authCredentials.workerId, workerId))
      .limit(1);
    return rows.length > 0 ? rowToCredential(rows[0]) : null;
  }

  async save(credential: AuthCredential): Promise<void> {
    const row: AuthCredentialRow = {
      workerId: credential.workerId,
      passwordHash: credential.passwordHash,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
    await this.db
      .insert(authCredentials)
      .values(row)
      .onConflictDoUpdate({ target: authCredentials.workerId, set: row });
  }
}
