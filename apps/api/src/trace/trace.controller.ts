import { type Actor, BatchId, TraceBatch, TraceForward } from '@fabrik/domain';
import { Controller, Get, Param } from '@nestjs/common';

import { Actor as ActorParam } from '../auth/actor.decorator.js';

import {
  type BatchForwardNodeResponse,
  type BatchTraceNodeResponse,
  serializeBatchForwardNode,
  serializeBatchTraceNode,
} from './trace.dto.js';

/**
 * Trazabilidad (Fase 6, docs/09). RBAC en el dominio (`TraceBatch` y
 * `TraceForward` son A/Au): un `worker` recibe 403 y un `batchId` desconocido
 * lanza `NotFoundError` → 404.
 *
 * - `GET /trace/:batchId`: genealogía **hacia atrás** (cada nodo lleva el lote y,
 *   si lo tiene, el evento que lo produjo; las hojas son los lotes de suministro).
 * - `GET /trace/:batchId/forward`: genealogía **hacia adelante** para *recall*
 *   (nodos de lote y de evento alternos; los eventos cuelgan del lote que consumen).
 */
@Controller('trace')
export class TraceController {
  constructor(
    private readonly traceBatch: TraceBatch,
    private readonly traceForward: TraceForward,
  ) {}

  @Get(':batchId')
  async backward(
    @ActorParam() actor: Actor,
    @Param('batchId') batchId: string,
  ): Promise<BatchTraceNodeResponse> {
    const node = await this.traceBatch.execute(actor, { batchId: BatchId.from(batchId) });
    return serializeBatchTraceNode(node);
  }

  @Get(':batchId/forward')
  async forward(
    @ActorParam() actor: Actor,
    @Param('batchId') batchId: string,
  ): Promise<BatchForwardNodeResponse> {
    const node = await this.traceForward.execute(actor, { batchId: BatchId.from(batchId) });
    return serializeBatchForwardNode(node);
  }
}
