interface EntityWithId<Id extends string> {
  readonly id: Id;
}

/**
 * Almacén en memoria compartido por los fakes de repositorio: upsert + lecturas
 * sobre un `Map` que conserva el orden de inserción. Guarda referencias directas
 * (las entidades del dominio son inmutables, no hace falta clonar).
 *
 * No forma parte del API público del paquete (vive en `src/testing`).
 */
export class InMemoryStore<Id extends string, Entity extends EntityWithId<Id>> {
  private readonly items = new Map<Id, Entity>();

  get(id: Id): Entity | null {
    return this.items.get(id) ?? null;
  }

  upsert(entity: Entity): void {
    this.items.set(entity.id, entity);
  }

  all(): readonly Entity[] {
    return [...this.items.values()];
  }

  remove(id: Id): void {
    this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }
}
