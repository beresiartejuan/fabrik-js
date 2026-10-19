import {
  type Actor,
  BatchEventId,
  BatchId,
  GetBatch,
  ListBatches,
  MaterialId,
  RecipeId,
} from '@fabrik/domain';
import { Controller, Get, Param, Query } from '@nestjs/common';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { type BatchResponse, serializeBatch } from '../common/entity-serializers.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import { type ListBatchesQuery, ListBatchesQuerySchema } from './batches.dto.js';

/**
 * Consulta de lotes (post-plan; hueco del plan de web, `docs/plans/10-plan-de-web.md`).
 * RBAC en el dominio: `GetBatch` y `ListBatches` son A/Au/W (abiertos al worker
 * porque la pantalla `/produccion` la consume el operario). Un rol indebido
 * recibiría 403; un `id` desconocido lanza `NotFoundError` → 404.
 *
 * - `GET /batches?...`: listado con filtros opcionales `status`, `materialId`,
 *   `recipeId` y `originBatchEventId` (todos los de `BatchFilter`).
 * - `GET /batches/:id`: un lote por id, serializado con `serializeBatch`.
 *
 * No hay endpoint de escritura de lotes: se crean por los flujos de `production`
 * y `supplies` (los estados cambian con `store`/`complete`), así que este recurso
 * es de solo lectura.
 */
@Controller('batches')
export class BatchesController {
  constructor(
    private readonly listBatches: ListBatches,
    private readonly getBatch: GetBatch,
  ) {}

  @Get()
  async list(
    @ActorParam() actor: Actor,
    @Query(new ZodValidationPipe(ListBatchesQuerySchema)) query: ListBatchesQuery,
  ): Promise<BatchResponse[]> {
    const batches = await this.listBatches.execute(actor, {
      filter: {
        status: query.status,
        materialId: query.materialId ? MaterialId.from(query.materialId) : undefined,
        recipeId: query.recipeId ? RecipeId.from(query.recipeId) : undefined,
        originBatchEventId: query.originBatchEventId
          ? BatchEventId.from(query.originBatchEventId)
          : undefined,
      },
    });
    return batches.map(serializeBatch);
  }

  @Get(':id')
  async get(@ActorParam() actor: Actor, @Param('id') id: string): Promise<BatchResponse> {
    const batch = await this.getBatch.execute(actor, { batchId: BatchId.from(id) });
    return serializeBatch(batch);
  }
}
