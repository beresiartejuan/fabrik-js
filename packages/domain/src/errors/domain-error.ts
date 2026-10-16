// Error base de la capa de dominio. Todo error propio del dominio hereda de aquí.
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
