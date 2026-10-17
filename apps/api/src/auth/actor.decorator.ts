import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { Actor as ActorContext } from '@fabrik/domain';

import type { AuthenticatedRequest } from './actor.guard.js';

/**
 * Inyecta el `Actor` que el `ActorGuard` dejó en la request. Uso:
 *
 * ```ts
 * @Post()
 * create(@Actor() actor: Actor, @Body(...) body: Dto) {
 *   return this.createMaterial.execute(actor, body);
 * }
 * ```
 *
 * Solo tiene sentido en rutas protegidas: si el handler no es `@Public()`, el
 * guard garantiza que `request.actor` está definido.
 */
export const Actor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.actor) {
      throw new Error('Actor no disponible: el handler debería estar protegido por ActorGuard');
    }
    return request.actor;
  },
);
