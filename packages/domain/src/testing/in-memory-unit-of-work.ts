import type { Repositories, UnitOfWork } from '../ports';

/**
 * `UnitOfWork` de test: ejecuta `fn` como una pasada directa sobre los
 * repositorios inyectados, sin atomicidad real (no hay commit/rollback). Basta
 * para ejercitar los use cases transaccionales contra el puerto; el adaptador de
 * `apps/api` es quien implementa la transacción de verdad.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private readonly repositories: Repositories) {}

  async run<T>(fn: (repositories: Repositories) => Promise<T>): Promise<T> {
    return fn(this.repositories);
  }
}
