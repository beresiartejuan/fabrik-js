import { Controller, Get, Query } from '@nestjs/common';
import { ListBatchEvents, MachineId, MaterialId, WorkerId, type Actor } from '@fabrik/domain';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { serializeBatchEvent, type BatchEventResponse } from '../common/entity-serializers.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import { BatchEventsQuerySchema, type BatchEventsQuery } from './batch-events.dto.js';

/**
 * Búsqueda de eventos de transformación (Fase 6, docs/09). RBAC en el dominio
 * (`ListBatchEvents` es A/Au): un `worker` recibe 403.
 *
 * `GET /batch-events` devuelve los eventos que cumplen los filtros (máquina,
 * worker, material —presente en inputs **o** outputs— y rango inclusivo
 * `from`/`to`) en orden cronológico ascendente. Sin filtros devuelve todos.
 */
@Controller('batch-events')
export class BatchEventsController {
  constructor(private readonly listBatchEvents: ListBatchEvents) {}

  @Get()
  async list(
    @ActorParam() actor: Actor,
    @Query(new ZodValidationPipe(BatchEventsQuerySchema)) query: BatchEventsQuery,
  ): Promise<BatchEventResponse[]> {
    const dateRange =
      query.from !== undefined || query.to !== undefined
        ? { from: query.from, to: query.to }
        : undefined;

    const events = await this.listBatchEvents.execute(actor, {
      machineId: query.machineId ? MachineId.from(query.machineId) : undefined,
      workerId: query.workerId ? WorkerId.from(query.workerId) : undefined,
      materialId: query.materialId ? MaterialId.from(query.materialId) : undefined,
      dateRange,
    });
    return events.map(serializeBatchEvent);
  }
}
