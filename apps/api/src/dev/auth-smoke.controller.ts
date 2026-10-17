import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CreateMaterial, MaterialId, type Actor } from '@fabrik/domain';
import { z } from 'zod';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

const SmokeMaterialSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(['supply', 'product']),
  physicalState: z.enum(['solid', 'liquid', 'gas']),
  unitOfMeasure: z.enum(['g', 'kg', 'unit', 'ml', 'l', 'm3']),
});
type SmokeMaterialDto = z.infer<typeof SmokeMaterialSchema>;

/**
 * Controlador **de andamiaje** (Fase 3) para probar la cadena
 * guard → caso de uso → `DomainExceptionFilter` de punta a punta.
 *
 * Existe porque la Fase 4 aún no tiene controladores de dominio: sin una ruta que
 * ejecute un caso de uso real con el `Actor`, el criterio de salida de la Fase 3
 * ("rol incorrecto → 403") no se puede verificar por e2e. Ejecuta `CreateMaterial`
 * (rol A), de modo que un `auditor`/`worker` autenticado recibe el
 * `UnauthorizedRoleError` → 403 del filtro global, y un `admin` obtiene 201.
 *
 * **Decisión:** se mantiene (no es temporal) porque prueba de forma permanente que
 * autenticación y autorización están encadenadas. Se elimina en la Fase 4 cuando
 * los recursos REST reales cubran el mismo camino. Ruta sin `@Public()`: pasa por
 * `ActorGuard`.
 */
@Controller('dev/auth-smoke')
export class AuthSmokeController {
  constructor(private readonly createMaterial: CreateMaterial) {}

  @Post('materials')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(SmokeMaterialSchema)) body: SmokeMaterialDto,
  ): Promise<{ id: MaterialId; name: string }> {
    const material = await this.createMaterial.execute(actor, {
      name: body.name,
      kind: body.kind,
      physicalState: body.physicalState,
      unitOfMeasure: body.unitOfMeasure,
    });
    return { id: material.id, name: material.name };
  }
}
