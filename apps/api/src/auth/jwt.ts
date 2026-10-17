import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { WorkerRole } from '@fabrik/domain';

/**
 * JWT manual (Fase 3, docs/09): JWS compacto `header.payload.signature` firmado
 * con **HMAC-SHA256** desde `node:crypto`.
 *
 * Decisión (frente a `jsonwebtoken`/`jose`): la firma HMAC de un JWT es un
 * HMAC-SHA256 sobre `header.payload` codificado en base64url; implementarla son
 * ~60 líneas y evita añadir una dependencia (el proyecto mantiene cero deps
 * extra). Además, se controla al 100% el formato del payload, la validación de
 * `exp` y la distinción de errores (malformado / firma / vencido) que necesita el
 * `ActorGuard`. Cuando haga falta rotación de claves (JWKS) o `RS256`, se
 * reevalúa; hoy no se necesita.
 */

/** Tipo de token para separar el de acceso del de refresco. */
export type TokenType = 'access' | 'refresh';

/** Claims que transporta el token (los que usamos, no la RFC completa). */
export interface JwtClaims {
  /** `subject`: id del worker. */
  readonly sub: string;
  readonly role?: WorkerRole;
  readonly typ?: TokenType;
  /** `jwt id`: identifica el refresh token en `refresh_tokens`. */
  readonly jti?: string;
}

/** Payload verificado, con los claims temporales ya rellenos. */
export interface JwtPayload extends JwtClaims {
  readonly iat: number;
  readonly exp: number;
}

export type JwtErrorReason = 'malformed' | 'signature' | 'expired';

export class JwtError extends Error {
  readonly reason: JwtErrorReason;

  constructor(reason: JwtErrorReason, message: string) {
    super(message);
    this.name = 'JwtError';
    this.reason = reason;
  }
}

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

export interface SignJwtOptions {
  /** Vida del token en segundos. */
  readonly expiresInSeconds: number;
  /** Instante de emisión en segundos epoch (por defecto, ahora). Inyectable en tests. */
  readonly now?: number;
}

export interface VerifyJwtOptions {
  /** Instante de validación en segundos epoch (por defecto, ahora). Inyectable en tests. */
  readonly now?: number;
}

function base64url(data: Buffer | string): string {
  return Buffer.from(data).toString('base64url');
}

function hmac(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

/** Emite un JWT compacto firmado con HMAC-SHA256. */
export function signJwt(claims: JwtClaims, secret: string, options: SignJwtOptions): string {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    ...claims,
    iat: now,
    exp: now + options.expiresInSeconds,
  };
  const signingInput = `${base64url(JSON.stringify(HEADER))}.${base64url(JSON.stringify(payload))}`;
  return `${signingInput}.${base64url(hmac(signingInput, secret))}`;
}

/**
 * Alfabeto base64url **sin padding**: `[A-Za-z0-9_-]`. Se valida cada segmento
 * antes de decodificar para rechazar entradas como `sig=` (padding) o con
 * espacios, que `Buffer.from(..., 'base64url')` tolera silenciosamente y podrían
 * colar variantes no canónicas del mismo token.
 */
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

function isPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.iat === 'number' &&
    typeof candidate.exp === 'number'
  );
}

/**
 * Verifica firma, forma y vigencia de un JWT. Lanza `JwtError` con `reason`
 * (`malformed` | `signature` | `expired`) en caso de fallo.
 */
export function verifyJwt(token: string, secret: string, options: VerifyJwtOptions = {}): JwtPayload {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new JwtError('malformed', 'El token no tiene el formato JWT compacto');
  }
  const [header, payload, signature] = segments as [string, string, string];

  if (
    !BASE64URL_SEGMENT.test(header) ||
    !BASE64URL_SEGMENT.test(payload) ||
    !BASE64URL_SEGMENT.test(signature)
  ) {
    throw new JwtError('malformed', 'Los segmentos del token no son base64url');
  }

  const expected = hmac(`${header}.${payload}`, secret);
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new JwtError('signature', 'Firma inválida');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new JwtError('malformed', 'Payload ilegible');
  }
  if (!isPayload(decoded)) {
    throw new JwtError('malformed', 'Payload con claims obligatorios ausentes');
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (now >= decoded.exp) {
    throw new JwtError('expired', 'El token está vencido');
  }
  return decoded;
}

/** Hash con el que se persisten los refresh tokens (nunca se guarda el token en claro). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparación de strings en tiempo constante (longitudes distintas → `false`). */
export function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
