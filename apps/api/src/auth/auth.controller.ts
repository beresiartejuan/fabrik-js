import type { Actor } from '@fabrik/domain';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import { Actor as ActorParam } from './actor.decorator.js';
import { AuthService, type AuthTokens } from './auth.service.js';
import { type LoginDto, LoginSchema, type RefreshDto, RefreshSchema } from './dto.js';
import { Public } from './public.decorator.js';

/**
 * Endpoints de auth (Fase 3).
 *
 * - `POST /auth/login` (público): `{ name, password }` → par de tokens.
 * - `POST /auth/refresh` (público): `{ refreshToken }` → par nuevo y revoca el viejo.
 * - `POST /auth/logout` (protegido): revoca todos los refresh del actor.
 * - `GET /auth/me` (protegido): devuelve el `Actor` resuelto por el guard. Es a la
 *   vez un endpoint útil para el front y el smoke-test del guard.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginDto): Promise<AuthTokens> {
    return this.auth.login(body.name, body.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@ActorParam() actor: Actor): Promise<void> {
    await this.auth.logout(actor);
  }

  @Get('me')
  me(@ActorParam() actor: Actor): { workerId: string; role: Actor['role'] } {
    return { workerId: actor.workerId, role: actor.role };
  }
}
