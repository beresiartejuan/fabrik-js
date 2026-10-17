// Tokens de inyección de la capa de auth (Fase 3). Igual que en `domain/tokens.ts`,
// las interfaces (`CredentialRepository`, `RefreshTokenRepository`, `AuthConfig`)
// no existen en runtime, así que se usa un `symbol` por contrato.

/** Configuración de auth resuelta desde el entorno (`AuthConfig`). */
export const AUTH_CONFIG = Symbol('FABRIK_AUTH_CONFIG');

/** Persistencia de credenciales (`CredentialRepository`). */
export const CREDENTIAL_REPOSITORY = Symbol('FABRIK_CREDENTIAL_REPOSITORY');

/** Persistencia de refresh tokens (`RefreshTokenRepository`). */
export const REFRESH_TOKEN_REPOSITORY = Symbol('FABRIK_REFRESH_TOKEN_REPOSITORY');
