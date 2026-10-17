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
  CreateMaterial,
  DeactivateMaterial,
  GetMaterial,
  ListMaterials,
  MaterialId,
  UpdateMaterial,
  type Actor,
} from '@fabrik/domain';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import {
  CreateMaterialSchema,
  ListMaterialsQuerySchema,
  UpdateMaterialSchema,
  serializeMaterial,
  type CreateMaterialDto,
  type ListMaterialsQuery,
  type MaterialResponse,
  type UpdateMaterialDto,
} from './materials.dto.js';

/**
 * Catálogo de materiales (Fase 4, docs/09).
 *
 * El RBAC **no** se reimplementa: el controlador solo inyecta el `Actor` y el
 * caso de uso aplica `requireRole` (`admin` escribe; `admin`/`auditor` leen). Un
 * rol indebido recibe `UnauthorizedRoleError` → 403 por el filtro global.
 *
 * `POST /materials/:id/deactivate` en vez de `DELETE`: el dominio no tiene borrado
 * físico (la baja es lógica, `active = false`, idempotente). Un `DELETE` sugeriría
 * un borrado duro inexistente; el endpoint de acción es más honesto y repetible.
 */
@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly createMaterial: CreateMaterial,
    private readonly updateMaterial: UpdateMaterial,
    private readonly deactivateMaterial: DeactivateMaterial,
    private readonly getMaterial: GetMaterial,
    private readonly listMaterials: ListMaterials,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(CreateMaterialSchema)) body: CreateMaterialDto,
  ): Promise<MaterialResponse> {
    const material = await this.createMaterial.execute(actor, body);
    return serializeMaterial(material);
  }

  @Get()
  async list(
    @ActorParam() actor: Actor,
    @Query(new ZodValidationPipe(ListMaterialsQuerySchema)) query: ListMaterialsQuery,
  ): Promise<MaterialResponse[]> {
    const materials = await this.listMaterials.execute(actor, {
      filter: { kind: query.kind, physicalState: query.physicalState },
    });
    return materials.map(serializeMaterial);
  }

  @Get(':id')
  async get(@ActorParam() actor: Actor, @Param('id') id: string): Promise<MaterialResponse> {
    const material = await this.getMaterial.execute(actor, { id: MaterialId.from(id) });
    return serializeMaterial(material);
  }

  @Patch(':id')
  async update(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMaterialSchema)) body: UpdateMaterialDto,
  ): Promise<MaterialResponse> {
    const material = await this.updateMaterial.execute(actor, { id: MaterialId.from(id), ...body });
    return serializeMaterial(material);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
  ): Promise<MaterialResponse> {
    const material = await this.deactivateMaterial.execute(actor, { id: MaterialId.from(id) });
    return serializeMaterial(material);
  }
}
