import {
  type Actor,
  CreateMachine,
  GetMachine,
  ListMachines,
  LocationId,
  MachineId,
  MoveMachine,
  UpdateMachine,
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
  type CreateMachineDto,
  CreateMachineSchema,
  type ListMachinesQuery,
  ListMachinesQuerySchema,
  type MachineResponse,
  type MoveMachineDto,
  MoveMachineSchema,
  serializeMachine,
  type UpdateMachineDto,
  UpdateMachineSchema,
} from './machines.dto.js';

/**
 * Catálogo de máquinas (Fase 4, docs/09). RBAC en el dominio. El lugar se cambia
 * con `POST /machines/:id/move` (valida I2: el destino debe ser `production`) y no
 * por `PATCH`, para que el cambio de lugar tenga su propio evento `machine.moved`.
 */
@Controller('machines')
export class MachinesController {
  constructor(
    private readonly createMachine: CreateMachine,
    private readonly updateMachine: UpdateMachine,
    private readonly moveMachine: MoveMachine,
    private readonly getMachine: GetMachine,
    private readonly listMachines: ListMachines,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(CreateMachineSchema)) body: CreateMachineDto,
  ): Promise<MachineResponse> {
    const machine = await this.createMachine.execute(actor, {
      name: body.name,
      type: body.type,
      locationId: LocationId.from(body.locationId),
    });
    return serializeMachine(machine);
  }

  @Get()
  async list(
    @ActorParam() actor: Actor,
    @Query(new ZodValidationPipe(ListMachinesQuerySchema)) query: ListMachinesQuery,
  ): Promise<MachineResponse[]> {
    const machines = await this.listMachines.execute(actor, {
      filter: {
        locationId: query.locationId ? LocationId.from(query.locationId) : undefined,
        status: query.status,
        type: query.type,
      },
    });
    return machines.map(serializeMachine);
  }

  @Get(':id')
  async get(@ActorParam() actor: Actor, @Param('id') id: string): Promise<MachineResponse> {
    const machine = await this.getMachine.execute(actor, { id: MachineId.from(id) });
    return serializeMachine(machine);
  }

  @Patch(':id')
  async update(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMachineSchema)) body: UpdateMachineDto,
  ): Promise<MachineResponse> {
    const machine = await this.updateMachine.execute(actor, { id: MachineId.from(id), ...body });
    return serializeMachine(machine);
  }

  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  async move(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MoveMachineSchema)) body: MoveMachineDto,
  ): Promise<MachineResponse> {
    const machine = await this.moveMachine.execute(actor, {
      id: MachineId.from(id),
      locationId: LocationId.from(body.locationId),
    });
    return serializeMachine(machine);
  }
}
