import type { Repositories, UnitOfWork } from '@fabrik/domain';

import type { Db } from './client.js';
import { createRepositories } from './repositories/index.js';

/**
 * `UnitOfWork` transaccional sobre Drizzle.
 *
 * `run` abre una transacción y entrega a `fn` un `Repositories` **ligado al `tx`**
 * (no a la conexión): si `fn` resuelve se hace commit; si lanza, rollback. Es
 * importante que los adaptadores usen el `tx` y no el `db` externo, porque en el
 * motor de Turso las operaciones sobre la conexión esperan al lock de la
 * transacción y podrían bloquearse (ver `@tursodatabase/database`).
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Db) {}

  async run<T>(fn: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const repositories = createRepositories(tx);
      return fn(repositories);
    });
  }
}
