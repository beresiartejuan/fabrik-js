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
import {
  CreateLocation,
  GetLocation,
  ListLocations,
  LocationId,
  UpdateLocation,
  type Actor,
} from '@fabrik/domain';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import {
  CreateLocationSchema,
  ListLocationsQuerySchema,
  UpdateLocationSchema,
  serializeLocation,
  type CreateLocationDto,
  type ListLocationsQuery,
  type LocationResponse,
  type UpdateLocationDto,
} from './locations.dto.js';

/**
 * Catálogo de lugares (Fase 4, docs/09). RBAC en el dominio (`admin` escribe;
 * `admin`/`auditor` leen). `PATCH` no acepta `kind`: `UpdateLocation` solo
 * renombra (ver `location-use-cases.ts`).
 */
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly createLocation: CreateLocation,
    private readonly updateLocation: UpdateLocation,
    private readonly getLocation: GetLocation,
    private readonly listLocations: ListLocations,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(CreateLocationSchema)) body: CreateLocationDto,
  ): Promise<LocationResponse> {
    const location = await this.createLocation.execute(actor, body);
    return serializeLocation(location);
  }

  @Get()
  async list(
    @ActorParam() actor: Actor,
    @Query(new ZodValidationPipe(ListLocationsQuerySchema)) query: ListLocationsQuery,
  ): Promise<LocationResponse[]> {
    const locations = await this.listLocations.execute(actor, { filter: { kind: query.kind } });
    return locations.map(serializeLocation);
  }

  @Get(':id')
  async get(@ActorParam() actor: Actor, @Param('id') id: string): Promise<LocationResponse> {
    const location = await this.getLocation.execute(actor, { id: LocationId.from(id) });
    return serializeLocation(location);
  }

  @Patch(':id')
  async update(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLocationSchema)) body: UpdateLocationDto,
  ): Promise<LocationResponse> {
    const location = await this.updateLocation.execute(actor, { id: LocationId.from(id), ...body });
    return serializeLocation(location);
  }
}
