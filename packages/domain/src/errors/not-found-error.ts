import { DomainError } from './domain-error';

// Convención de lecturas por id (Fase 5): cuando la entidad no existe se lanza
// este error en lugar de devolver `null`, para no propagar valores vacíos al
// borde de la aplicación.
export class NotFoundError extends DomainError {
  readonly entity: string;
  readonly id: string;

  constructor(entity: string, id: string) {
    super(`${entity} no encontrado: ${id}`);
    this.name = 'NotFoundError';
    this.entity = entity;
    this.id = id;
  }
}
