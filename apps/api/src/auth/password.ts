import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Hash de contraseñas con **scrypt** de `node:crypto` (Fase 3, docs/09).
 *
 * Decisión (frente a bcrypt/argon2): scrypt es un KDF *memory-hard* que viene en
 * la librería estándar de Node, así que no añade dependencias nativas pesadas
 * (bcrypt/argon2 obligan a compilar un addon y complican el despliegue). Los
 * parámetros por defecto (`N=2^14`, `r=8`, `p=1`) son el "interactive" recomendado
 * por la RFC 7914 y caben en el `maxmem` por defecto (~32 MiB).
 *
 * Formato autocontenido (una sola columna `password_hash`), sin columna `salt`:
 *
 * ```
 * scrypt$N=16384,r=8,p=1$<salt-base64url>$<hash-base64url>
 * ```
 *
 * Incluye algoritmo, parámetros y sal en el propio string, de modo que verificar
 * no necesita configuración externa y permite subir los parámetros en el futuro
 * sin invalidar las credenciales existentes (cada una lleva los suyos).
 */

export interface ScryptParams {
  /** Coste CPU/memoria (potencia de 2). */
  readonly N: number;
  /** Tamaño de bloque. */
  readonly r: number;
  /** Paralelismo. */
  readonly p: number;
  /** Longitud de la clave derivada en bytes. */
  readonly keyLength: number;
}

/** Parámetros por defecto (RFC 7914, perfil "interactive"). */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  N: 2 ** 14,
  r: 8,
  p: 1,
  keyLength: 64,
};

const ALGORITHM = 'scrypt';
const SALT_BYTES = 16;

interface ParsedHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

/** Envuelve el `scrypt` con callback en una promesa (no bloquea el event loop). */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function toOptions(params: ScryptParams): ScryptOptions {
  return { N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * 2 };
}

/** Deriva el hash autocontenido de `password` con una sal aleatoria nueva. */
export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, params.keyLength, toOptions(params));
  const parameterSegment = `N=${params.N},r=${params.r},p=${params.p}`;
  return [
    ALGORITHM,
    parameterSegment,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

function parseHash(encoded: string): ParsedHash | null {
  const segments = encoded.split('$');
  if (segments.length !== 4 || segments[0] !== ALGORITHM) {
    return null;
  }
  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(segments[1] ?? '');
  if (!match) {
    return null;
  }
  const [, n, r, p] = match;
  const salt = Buffer.from(segments[2] ?? '', 'base64url');
  const hash = Buffer.from(segments[3] ?? '', 'base64url');
  if (salt.length === 0 || hash.length === 0) {
    return null;
  }
  return {
    salt,
    hash,
    params: { N: Number(n), r: Number(r), p: Number(p), keyLength: hash.length },
  };
}

/**
 * Verifica `password` contra un hash autocontenido. Devuelve `false` ante un
 * formato inválido (nunca lanza) y compara con `timingSafeEqual` para no filtrar
 * información por el tiempo de comparación.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parseHash(encoded);
  if (!parsed) {
    return false;
  }
  const derived = await scryptAsync(
    password,
    parsed.salt,
    parsed.hash.length,
    toOptions(parsed.params),
  );
  if (derived.length !== parsed.hash.length) {
    return false;
  }
  return timingSafeEqual(derived, parsed.hash);
}
