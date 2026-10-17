import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/public.decorator.js';

/** Health check barato para e2e/deployment (Fase 2). Público (sin token). */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { ok: true } {
    return { ok: true };
  }
}
