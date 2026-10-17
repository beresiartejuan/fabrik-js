import { Worker, WorkerId, type WorkerRepository } from '@fabrik/domain';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { ActorGuard, type AuthenticatedRequest } from './actor.guard.js';
import type { AuthConfig } from './auth.config.js';
import { signJwt } from './jwt.js';

const ACCESS_SECRET = 'access-secret-de-prueba';
const CONFIG: AuthConfig = {
  accessSecret: ACCESS_SECRET,
  refreshSecret: 'refresh-secret-de-prueba',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3_600,
};

function accessToken(
  overrides: {
    sub?: string;
    role?: 'admin' | 'worker' | 'auditor';
    expiresInSeconds?: number;
    now?: number;
  } = {},
): string {
  return signJwt(
    { sub: overrides.sub ?? 'worker-1', role: overrides.role ?? 'admin', typ: 'access' },
    ACCESS_SECRET,
    {
      expiresInSeconds: overrides.expiresInSeconds ?? 900,
      now: overrides.now ?? Math.floor(Date.now() / 1000),
    },
  );
}

function requestWith(authorization?: string): AuthenticatedRequest {
  return { headers: authorization ? { authorization } : {} } as AuthenticatedRequest;
}

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function reflectorFor(isPublic: boolean): Reflector {
  return { getAllAndOverride: vi.fn(() => isPublic) } as unknown as Reflector;
}

function repositoryReturning(worker: Worker | null): WorkerRepository {
  return {
    findById: vi.fn(async () => worker),
    list: vi.fn(async () => (worker ? [worker] : [])),
    save: vi.fn(async () => undefined),
  };
}

describe('ActorGuard', () => {
  it('deja pasar una ruta pública sin token', async () => {
    const request = requestWith();
    const guard = new ActorGuard(reflectorFor(true), CONFIG, repositoryReturning(null));
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.actor).toBeUndefined();
  });

  it('401 si falta la cabecera Authorization', async () => {
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repositoryReturning(null));
    await expect(guard.canActivate(contextFor(requestWith()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['esquema no Bearer', 'Basic abc'],
    ['token no JWT', 'Bearer no-es-un-jwt'],
  ])('401 con token inválido (%s)', async (_label, header) => {
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repositoryReturning(null));
    await expect(guard.canActivate(contextFor(requestWith(header)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('401 si se presenta un refresh token como access token', async () => {
    const refresh = signJwt(
      { sub: 'worker-1', role: 'admin', typ: 'refresh', jti: 'j1' },
      CONFIG.refreshSecret,
      { expiresInSeconds: 900, now: Math.floor(Date.now() / 1000) },
    );
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repositoryReturning(null));
    await expect(
      guard.canActivate(contextFor(requestWith(`Bearer ${refresh}`))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 con access token vencido', async () => {
    const token = accessToken({ expiresInSeconds: 10, now: 0 });
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repositoryReturning(null));
    await expect(
      guard.canActivate(contextFor(requestWith(`Bearer ${token}`))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 si el worker no existe', async () => {
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repositoryReturning(null));
    await expect(
      guard.canActivate(contextFor(requestWith(`Bearer ${accessToken()}`))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 si el worker está inactivo', async () => {
    const inactive = Worker.create({ name: 'Baja', role: 'admin' }).deactivate();
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repositoryReturning(inactive));
    await expect(
      guard.canActivate(contextFor(requestWith(`Bearer ${accessToken({ sub: inactive.id })}`))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('autentica y toma el rol ACTUAL del worker (no el claim del token)', async () => {
    const worker = Worker.create({ name: 'Ana', role: 'auditor' });
    const request = requestWith(`Bearer ${accessToken({ sub: worker.id, role: 'admin' })}`);
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repositoryReturning(worker));

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.actor).toEqual({ workerId: worker.id, role: 'auditor' });
  });

  it('reconstituye el worker por el `sub` del token', async () => {
    const worker = Worker.create({ name: 'Ana', role: 'worker' });
    const findById = vi.fn(async () => worker);
    const repository: WorkerRepository = {
      findById,
      list: vi.fn(async () => [worker]),
      save: vi.fn(async () => undefined),
    };
    const guard = new ActorGuard(reflectorFor(false), CONFIG, repository);
    const request = requestWith(`Bearer ${accessToken({ sub: worker.id })}`);

    await guard.canActivate(contextFor(request));
    expect(findById).toHaveBeenCalledWith(WorkerId.from(worker.id));
  });
});
