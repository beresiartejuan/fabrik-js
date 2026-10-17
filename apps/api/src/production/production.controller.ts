import {
  type Actor,
  BatchId,
  type BatchRepository,
  CompleteProduction,
  LocationId,
  MachineId,
  MaterialId,
  Quantity,
  RecipeId,
  RecipeStepId,
  RecordTransformation,
  StartProduction,
  StoreBatch,
} from '@fabrik/domain';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import {
  type BatchResponse,
  serializeBatch,
  serializeBatchEvent,
} from '../common/entity-serializers.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { BATCH_REPOSITORY } from '../domain/tokens.js';

import {
  type CompleteProductionDto,
  CompleteProductionSchema,
  clientTimestampAllowed,
  type RecordTransformationDto,
  RecordTransformationSchema,
  type StartProductionDto,
  StartProductionSchema,
  type StoreBatchDto,
  StoreBatchSchema,
  type TransformationResponse,
} from './production.dto.js';

/**
 * Producción (Fase 5, docs/09). RBAC en el dominio: `StartProduction` es solo
 * `admin`; `RecordTransformation` es solo `worker`; `StoreBatch` y
 * `CompleteProduction` son `admin`/`worker`. Un rol indebido → 403 por el filtro.
 *
 * Rutas y semántica:
 * - `POST /production/start` (201): crea el lote raíz `in_progress` desde la receta.
 * - `POST /production/transform` (201): registra la transformación. El `workerId` se
 *   toma **del `Actor` autenticado**, nunca del cuerpo (ver `production.dto.ts`).
 *   El `timestamp` del cuerpo solo se usa con `FABRIK_ALLOW_CLIENT_TIMESTAMP=true`
 *   (tests); en producción manda el reloj del servidor.
 *   Devuelve el evento y los lotes de output creados.
 * - `POST /production/store` (200): mueve un lote `in_progress` a almacenamiento.
 *   Se mantiene `/production/store` (no `POST /batches/:id/store`) para seguir el
 *   plan y porque el cuerpo lleva `batchId` + `locationId` (no hay recurso `batches`
 *   propio todavía).
 * - `POST /production/complete` (200): cierra la orden de producción (lote con receta).
 *
 * El controlador inyecta `BatchRepository` **solo** para resolver los lotes de
 * output de una transformación (`list({ originBatchEventId })`); es una lectura de
 * apoyo a la respuesta, no lógica de negocio.
 */
@Controller('production')
export class ProductionController {
  constructor(
    private readonly startProduction: StartProduction,
    private readonly recordTransformation: RecordTransformation,
    private readonly storeBatch: StoreBatch,
    private readonly completeProduction: CompleteProduction,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepository,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  async start(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(StartProductionSchema)) body: StartProductionDto,
  ): Promise<BatchResponse> {
    const batch = await this.startProduction.execute(actor, {
      recipeId: RecipeId.from(body.recipeId),
    });
    return serializeBatch(batch);
  }

  @Post('transform')
  @HttpCode(HttpStatus.CREATED)
  async transform(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(RecordTransformationSchema)) body: RecordTransformationDto,
  ): Promise<TransformationResponse> {
    const event = await this.recordTransformation.execute(actor, {
      machineId: MachineId.from(body.machineId),
      workerId: actor.workerId,
      recipeStepId: body.recipeStepId ? RecipeStepId.from(body.recipeStepId) : undefined,
      inputs: body.inputs.map((input) => ({
        batchId: BatchId.from(input.batchId),
        quantity: Quantity.create(input.quantity.amount, input.quantity.unit),
      })),
      outputs: body.outputs.map((output) => ({
        materialId: MaterialId.from(output.materialId),
        quantity: Quantity.create(output.quantity.amount, output.quantity.unit),
      })),
      observation: body.observation,
      // El `timestamp` del cuerpo solo se honra con el flag de tests; si no, se
      // deja `undefined` y el dominio usa `new Date()` en el servidor (MEDIA #3).
      timestamp: clientTimestampAllowed() ? body.timestamp : undefined,
    });
    const outputBatches = await this.batches.list({ originBatchEventId: event.id });
    return { event: serializeBatchEvent(event), outputBatches: outputBatches.map(serializeBatch) };
  }

  @Post('store')
  @HttpCode(HttpStatus.OK)
  async store(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(StoreBatchSchema)) body: StoreBatchDto,
  ): Promise<BatchResponse> {
    const batch = await this.storeBatch.execute(actor, {
      batchId: BatchId.from(body.batchId),
      locationId: LocationId.from(body.locationId),
    });
    return serializeBatch(batch);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(CompleteProductionSchema)) body: CompleteProductionDto,
  ): Promise<BatchResponse> {
    const batch = await this.completeProduction.execute(actor, {
      batchId: BatchId.from(body.batchId),
    });
    return serializeBatch(batch);
  }
}
