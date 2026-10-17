import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LocationId, MaterialId, Quantity, RegisterSupplyArrival, type Actor } from '@fabrik/domain';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { serializeBatch, type BatchResponse } from '../common/entity-serializers.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import {
  RegisterSupplyArrivalSchema,
  type RegisterSupplyArrivalDto,
} from './supplies.dto.js';

/**
 * Ingreso de suministros (Fase 5, docs/09). RBAC en el dominio: `admin` y
 * `worker` pueden registrar arribos; `auditor` recibe 403.
 *
 * `POST /supplies/arrivals` crea un `Batch` `stored` en el lugar de almacenamiento
 * y un `StockMovement` `supply_in` (transaccional en el caso de uso). Por eso la
 * respuesta 201 es el lote creado. `MaterialId.from`/`Quantity.create` reconstruyen
 * los VOs del dominio para no duplicar invariantes en la API.
 */
@Controller('supplies')
export class SuppliesController {
  constructor(private readonly registerSupplyArrival: RegisterSupplyArrival) {}

  @Post('arrivals')
  @HttpCode(HttpStatus.CREATED)
  async arrive(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(RegisterSupplyArrivalSchema)) body: RegisterSupplyArrivalDto,
  ): Promise<BatchResponse> {
    const batch = await this.registerSupplyArrival.execute(actor, {
      materialId: MaterialId.from(body.materialId),
      quantity: Quantity.create(body.quantity.amount, body.quantity.unit),
      locationId: LocationId.from(body.locationId),
    });
    return serializeBatch(batch);
  }
}
