import { randomUUID } from 'node:crypto';
import type { Actor, Worker, WorkerRepository } from '@fabrik/domain';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { WORKER_REPOSITORY } from '../domain/tokens.js';
import type { AuthConfig } from './auth.config.js';
import { AUTH_CONFIG, CREDENTIAL_REPOSITORY, REFRESH_TOKEN_REPOSITORY } from './auth.tokens.js';
import type { CredentialRepository } from './credentials.repository.js';
import { hashToken, secureEqual, signJwt, verifyJwt } from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';
import type { RefreshTokenRepository } from './refresh-token.repository.js';

/** Par de tokens devuelto por login/refresh. */
export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  /** Vida del access token en segundos. */
  readonly expiresIn: number;
}

/**
 * Lógica de autenticación (Fase 3, docs/09).
 *
 * - **Login por `name` + contraseña.** Se decidió así porque el `Worker` del
 *   dominio se identifica por `name` (no hay email ni username aparte) y no se
 *   quiere inventar un campo de identidad nuevo. Documentado como limitación:
 *   `name` debería ser único; hoy lo garantiza el seeding/uso, no el esquema.
 * - Access token corto (JWT HMAC) + refresh token rotativo persistido (JWT HMAC
 *   con `jti`, guardado **hasheado**). Al refrescar se revoca el viejo con
 *   compare-and-swap (rotación segura ante carreras).
 * - **Detección de reuso**: presentar un refresh ya revocado (o perder la
 *   carrera de rotación) revoca toda la cadena viva del worker y responde 401.
 * - `logout` revoca todos los refresh vivos del worker.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(WORKER_REPOSITORY) private readonly workers: WorkerRepository,
    @Inject(CREDENTIAL_REPOSITORY) private readonly credentials: CredentialRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async login(name: string, password: string, now: Date = new Date()): Promise<AuthTokens> {
    const worker = (await this.workers.list()).find((candidate) => candidate.name === name);
    if (!worker) {
      // Se paga un scrypt igualmente para no delatar qué nombres existen (timing).
      await hashPassword(password);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const credential = await this.credentials.findByWorkerId(worker.id);
    if (!credential || !(await verifyPassword(password, credential.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!worker.active) {
      throw new UnauthorizedException('El worker está inactivo');
    }
    return this.issueTokens(worker, now);
  }

  async refresh(refreshToken: string, now: Date = new Date()): Promise<AuthTokens> {
    const nowSeconds = Math.floor(now.getTime() / 1000);

    let jti: string;
    try {
      const payload = verifyJwt(refreshToken, this.config.refreshSecret, { now: nowSeconds });
      if (payload.typ !== 'refresh' || !payload.jti) {
        throw new UnauthorizedException('Refresh token inválido');
      }
      jti = payload.jti;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Refresh token inválido o vencido');
    }

    const record = await this.refreshTokens.findById(jti);
    if (!record || record.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('Refresh token revocado o vencido');
    }
    // El hash se compara antes que el estado: un token con jti conocido pero
    // cuerpo manipulado no debe disparar la contención por reuso.
    if (!secureEqual(record.tokenHash, hashToken(refreshToken))) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Reuso: presentar un refresh ya revocado es señal de robo. Se revocan TODOS
    // los refresh vivos del worker (contención: la cadena entera queda muerta,
    // incluida cualquier rotación legítima posterior) y se responde 401.
    if (record.revokedAt !== null) {
      await this.refreshTokens.revokeAllForWorker(record.workerId, now);
      throw new UnauthorizedException('Refresh token revocado o reutilizado');
    }

    const worker = await this.workers.findById(record.workerId);
    if (!worker?.active) {
      throw new UnauthorizedException('El worker está inactivo');
    }

    // Rotación como compare-and-swap: solo el request que realmente pasa la fila
    // de `revoked_at NULL` → fecha emite el par nuevo. Si otro request
    // concurrente la ganó, este pierde y se trata como reuso (misma contención).
    const rotated = await this.refreshTokens.revoke(record.id, now);
    if (!rotated) {
      await this.refreshTokens.revokeAllForWorker(record.workerId, now);
      throw new UnauthorizedException('Refresh token revocado o reutilizado');
    }
    return this.issueTokens(worker, now);
  }

  async logout(actor: Actor, now: Date = new Date()): Promise<void> {
    await this.refreshTokens.revokeAllForWorker(actor.workerId, now);
  }

  private async issueTokens(worker: Worker, now: Date): Promise<AuthTokens> {
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const accessToken = signJwt(
      { sub: worker.id, role: worker.role, typ: 'access' },
      this.config.accessSecret,
      { expiresInSeconds: this.config.accessTtlSeconds, now: nowSeconds },
    );

    const jti = randomUUID();
    const refreshToken = signJwt(
      { sub: worker.id, role: worker.role, typ: 'refresh', jti },
      this.config.refreshSecret,
      { expiresInSeconds: this.config.refreshTtlSeconds, now: nowSeconds },
    );
    await this.refreshTokens.save({
      id: jti,
      workerId: worker.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date((nowSeconds + this.config.refreshTtlSeconds) * 1000),
      revokedAt: null,
      createdAt: now,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.accessTtlSeconds,
    };
  }
}
