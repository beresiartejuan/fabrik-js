import {
  type Actor,
  CreateWorker,
  DeactivateWorker,
  GetWorker,
  ListWorkers,
  UpdateWorker,
  WorkerId,
} from '@fabrik/domain';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import {
  type CreateWorkerDto,
  CreateWorkerSchema,
  type ListWorkersQuery,
  ListWorkersQuerySchema,
  serializeWorker,
  type UpdateWorkerDto,
  UpdateWorkerSchema,
  type WorkerResponse,
} from './workers.dto.js';

/**
 * Catálogo de trabajadores (Fase 4, docs/09). RBAC en el dominio.
 *
 * Solo se expone `POST /workers/:id/deactivate`: el dominio tiene
 * `Worker.activate()` (idempotente) pero **no** un caso de uso de reactivación, y
 * el plan de Fase 4 no lo pide. Añadirlo es trivial (el endpoint es simétrico)
 * pero se deja fuera para no inventar un caso de uso que el dominio no define.
 */
@Controller('workers')
export class WorkersController {
  constructor(
    private readonly createWorker: CreateWorker,
    private readonly updateWorker: UpdateWorker,
    private readonly deactivateWorker: DeactivateWorker,
    private readonly getWorker: GetWorker,
    private readonly listWorkers: ListWorkers,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(CreateWorkerSchema)) body: CreateWorkerDto,
  ): Promise<WorkerResponse> {
    const worker = await this.createWorker.execute(actor, body);
    return serializeWorker(worker);
  }

  @Get()
  async list(
    @ActorParam() actor: Actor,
    @Query(new ZodValidationPipe(ListWorkersQuerySchema)) query: ListWorkersQuery,
  ): Promise<WorkerResponse[]> {
    const workers = await this.listWorkers.execute(actor, {
      filter: { role: query.role, active: query.active },
    });
    return workers.map(serializeWorker);
  }

  @Get(':id')
  async get(@ActorParam() actor: Actor, @Param('id') id: string): Promise<WorkerResponse> {
    const worker = await this.getWorker.execute(actor, { id: WorkerId.from(id) });
    return serializeWorker(worker);
  }

  @Patch(':id')
  async update(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWorkerSchema)) body: UpdateWorkerDto,
  ): Promise<WorkerResponse> {
    const worker = await this.updateWorker.execute(actor, { id: WorkerId.from(id), ...body });
    return serializeWorker(worker);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@ActorParam() actor: Actor, @Param('id') id: string): Promise<WorkerResponse> {
    const worker = await this.deactivateWorker.execute(actor, { id: WorkerId.from(id) });
    return serializeWorker(worker);
  }
}
