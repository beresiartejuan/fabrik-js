import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { WorkerId, type Actor, type WorkerRepository } from '@fabrik/domain';

import { WORKER_REPOSITORY } from '../domain/tokens.js';

import { AUTH_CONFIG } from './auth.tokens.js';
import type { AuthConfig } from './auth.config.js';
import { verifyJwt } from './jwt.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/** Request de Express con el `Actor` resuelto por el guard. */
export interface AuthenticatedRequest extends Request {
  actor?: Actor;
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Guard de autenticación **global** (Fase 3, docs/09).
 *
 * - `@Public()` (`IS_PUBLIC_KEY`) en el handler o el controlador → deja pasar
 *   (`/health`, `/auth/login`, `/auth/refresh`).
 * - Si no: exige `Authorization: Bearer <access token>`, verifica firma/vigencia
 *   con `JWT_ACCESS_SECRET` y **carga el worker en cada request** para tomar el rol
 *   *actual*. No se confía en el claim `role` del token: si a un worker le cambian
 *   el rol, el token viejo no conserva privilegios (y si está inactivo, 401).
 * - Deja el `Actor` en `request.actor` (lo recoge el decorador `@Actor()`).
 *
 * Alcance: el guard solo **autentica**. No decide autorización por rol: eso vive
 * en los casos de uso del dominio, que lanzan `UnauthorizedRoleError` → 403 vía
 * `DomainExceptionFilter`. Cualquier fallo de autenticación es 401.
 */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(WORKER_REPOSITORY) private readonly workers: WorkerRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Falta el token de acceso');
    }

    let subject: string;
    try {
      const payload = verifyJwt(token, this.config.accessSecret);
      if (payload.typ !== 'access') {
        throw new UnauthorizedException('Se esperaba un access token');
      }
      subject = payload.sub;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token de acceso inválido o vencido');
    }

    const worker = await this.workers.findById(WorkerId.from(subject));
    if (!worker || !worker.active) {
      throw new UnauthorizedException('Worker inexistente o inactivo');
    }

    request.actor = { workerId: worker.id, role: worker.role };
    return true;
  }
}
