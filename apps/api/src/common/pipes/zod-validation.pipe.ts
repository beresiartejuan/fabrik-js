import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Pipe de validación con **zod** (Fase 2, docs/09).
 *
 * Uso previsto en los controladores de la Fase 4:
 *
 * ```ts
 * @Post()
 * create(@Body(new ZodValidationPipe(CreateMaterialSchema)) body: CreateMaterialDto) { ... }
 * ```
 *
 * Decisión frente a `class-validator`/`ValidationPipe`: los schemas de zod son
 * funciones puras reutilizables tal cual en `apps/web` (validación de formularios
 * con el mismo contrato que la API) y no exigen decoradores ni
 * `emitDecoratorMetadata`; `class-validator` obligaría a duplicar DTOs con
 * decoradores en cada lado. Además, zod infiere el tipo TypeScript del schema
 * (`z.infer<typeof Schema>`), así que el DTO y su validación no se pueden
 * desincronizar. El coste es escribir este pipe (~30 líneas) en vez de reusar el
 * `ValidationPipe` de Nest, que es intrínsecamente de `class-validator`.
 *
 * El error de validación se lanza como `HttpException` (400) con la lista de
 * `issues`, de forma que el `DomainExceptionFilter` lo deja pasar sin tocarlo.
 */
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationError',
        message: 'La petición no es válida',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
