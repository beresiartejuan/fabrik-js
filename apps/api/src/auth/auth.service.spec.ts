import { UnauthorizedException } from '@nestjs/common';
import { Worker, WorkerId, type WorkerRepository } from '@fabrik/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';
import type { AuthCredential, CredentialRepository } from './credentials.repository.js';
import { hashToken, signJwt, verifyJwt } from './jwt.js';
import { hashPassword } from './password.js';
import type { RefreshTokenRecord, RefreshTokenRepository } from './refresh-token.repository.js';

const CONFIG: AuthConfig = {
  accessSecret: 'access-secret-servicio',
  refreshSecret: 'refresh-secret-servicio',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3_600,
};

class FakeCredentials implements CredentialRepository {
  private readonly byWorker = new Map<string, AuthCredential>();

  async findByWorkerId(workerId: WorkerId): Promise<AuthCredential | null> {
    return this.byWorker.get(workerId) ?? null;
  }

  async save(credential: AuthCredential): Promise<void> {
    this.byWorker.set(credential.workerId, credential);
  }

  async seed(workerId: WorkerId, password: string): Promise<void> {
    const now = new Date();
    await this.save({
      workerId,
      passwordHash: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
    });
  }
}

class FakeRefreshTokens implements RefreshTokenRepository {
  readonly records = new Map<string, RefreshTokenRecord>();

  async save(record: RefreshTokenRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async findById(id: string): Promise<RefreshTokenRecord | null> {
    return this.records.get(id) ?? null;
  }

  async revoke(id: string, at: Date): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.revokedAt !== null) {
      return false;
    }
    this.records.set(id, { ...record, revokedAt: at });
    return true;
  }

  async revokeAllForWorker(workerId: WorkerId, at: Date): Promise<void> {
    for (const [id, record] of this.records) {
      if (record.workerId === workerId && record.revokedAt === null) {
        this.records.set(id, { ...record, revokedAt: at });
      }
    }
  }
}

function workerRepositoryOf(worker: Worker): WorkerRepository {
  return {
    findById: vi.fn(async (id: WorkerId) => (id === worker.id ? worker : null)),
    list: vi.fn(async () => [worker]),
    save: vi.fn(async () => undefined),
  };
}

describe('AuthService', () => {
  let workers: WorkerRepository;
  let credentials: FakeCredentials;
  let refreshTokens: FakeRefreshTokens;
  let service: AuthService;
  let worker: Worker;

  beforeEach(async () => {
    worker = Worker.create({ name: 'Admin', role: 'admin' });
    workers = workerRepositoryOf(worker);
    credentials = new FakeCredentials();
    refreshTokens = new FakeRefreshTokens();
    await credentials.seed(worker.id, 'correcta');
    service = new AuthService(CONFIG, workers, credentials, refreshTokens);
  });

  describe('login', () => {
    it('devuelve un par de tokens válido y guarda solo el hash del refresh', async () => {
      const tokens = await service.login('Admin', 'correcta');

      expect(verifyJwt(tokens.accessToken, CONFIG.accessSecret)).toMatchObject({
        sub: worker.id,
        role: 'admin',
        typ: 'access',
      });
      expect(verifyJwt(tokens.refreshToken, CONFIG.refreshSecret)).toMatchObject({
        sub: worker.id,
        typ: 'refresh',
      });
      expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });

      const stored = [...refreshTokens.records.values()];
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(hashToken(tokens.refreshToken));
      expect(stored[0]?.tokenHash).not.toBe(tokens.refreshToken);
      expect(stored[0]?.revokedAt).toBeNull();
    });

    it('401 si el nombre no existe (sin revelar si existe)', async () => {
      await expect(service.login('Nadie', 'correcta')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.records.size).toBe(0);
    });

    it('401 si la contraseña es incorrecta', async () => {
      await expect(service.login('Admin', 'mala')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.records.size).toBe(0);
    });

    it('401 si el worker está inactivo', async () => {
      const inactive = Worker.create({ name: 'Baja', role: 'admin' }).deactivate();
      const inactiveService = new AuthService(
        CONFIG,
        workerRepositoryOf(inactive),
        credentials,
        refreshTokens,
      );
      await credentials.seed(inactive.id, 'correcta');

      await expect(inactiveService.login('Baja', 'correcta')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh (rotación)', () => {
    it('rota el token: el nuevo par es válido y el viejo queda revocado', async () => {
      const first = await service.login('Admin', 'correcta');
      const second = await service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(refreshTokens.records.get(jtiOf(first.refreshToken))?.revokedAt).not.toBeNull();

      // El nuevo token sirve para seguir rotando.
      await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
    });

    it('refresh concurrente del mismo token: solo el primero gana la rotación', async () => {
      const first = await service.login('Admin', 'correcta');

      const results = await Promise.allSettled([
        service.refresh(first.refreshToken),
        service.refresh(first.refreshToken),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedException);
    });

    it('si pierde el compare-and-swap de la rotación → 401 y revoca la cadena', async () => {
      const first = await service.login('Admin', 'correcta');
      // Simula otro request que revocó la fila entre nuestro `findById` (que aún
      // la ve viva) y nuestro `revoke` (que pierde el CAS → false).
      const revokeSpy = vi.spyOn(refreshTokens, 'revoke').mockResolvedValue(false);
      const revokeAllSpy = vi.spyOn(refreshTokens, 'revokeAllForWorker');

      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(revokeAllSpy).toHaveBeenCalledWith(worker.id, expect.any(Date));

      revokeSpy.mockRestore();
      revokeAllSpy.mockRestore();
    });

    it('reuso de un refresh ya revocado → 401 y revoca también el par nuevo (cadena completa)', async () => {
      const first = await service.login('Admin', 'correcta');
      const second = await service.refresh(first.refreshToken);
      const secondJti = jtiOf(second.refreshToken);

      // Replay del token viejo: señal de robo.
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // Contención: el token legítimo recién emitido también queda revocado.
      expect(refreshTokens.records.get(secondJti)?.revokedAt).not.toBeNull();
      await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('401 con un refresh token con firma inválida o formato basura', async () => {
      await expect(service.refresh('no-es-un-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('401 si el refresh token fue firmado con otro secreto (jti inexistente)', async () => {
      const forged = signJwt(
        { sub: worker.id, typ: 'refresh', jti: 'no-existe' },
        'otro-secreto',
        { expiresInSeconds: 900 },
      );
      await expect(service.refresh(forged)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revoca todos los refresh vivos del worker', async () => {
      const first = await service.login('Admin', 'correcta');
      const second = await service.login('Admin', 'correcta');

      await service.logout({ workerId: worker.id, role: 'admin' });

      expect(refreshTokens.records.get(jtiOf(first.refreshToken))?.revokedAt).not.toBeNull();
      expect(refreshTokens.records.get(jtiOf(second.refreshToken))?.revokedAt).not.toBeNull();
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});

function jtiOf(token: string): string {
  const payload = verifyJwt(token, CONFIG.refreshSecret);
  if (!payload.jti) {
    throw new Error('El refresh token no tiene jti');
  }
  return payload.jti;
}
