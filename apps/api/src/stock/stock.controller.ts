import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  GetStockByLocation,
  GetStockMovements,
  LocationId,
  MaterialId,
  type Actor,
} from '@fabrik/domain';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import {
  serializeStockByLocationEntry,
  serializeStockMovement,
  type StockByLocationEntryResponse,
  type StockMovementResponse,
} from '../common/entity-serializers.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import { StockMovementsQuerySchema, type StockMovementsQuery } from './stock.dto.js';

/**
 * Inventario (Fase 5, docs/09). RBAC en el dominio:
 * - `GET /stock/:locationId` (`GetStockByLocation`): `admin`, `auditor` **y
 *   `worker`** (el operario necesita leer existencias).
 * - `GET /stock/:locationId/movements` (`GetStockMovements`): `admin`, `auditor`.
 *
 * Ambas lecturas validan que el lugar exista (→ 404) y el stock se calcula como
 * agregado de movimientos (posibles `amount` negativos en el lugar de la máquina
 * tras un consumo). Los `timestamp` salen como ISO 8601.
 */
@Controller('stock')
export class StockController {
  constructor(
    private readonly getStockByLocation: GetStockByLocation,
    private readonly getStockMovements: GetStockMovements,
  ) {}

  @Get(':locationId')
  async stock(
    @ActorParam() actor: Actor,
    @Param('locationId') locationId: string,
  ): Promise<StockByLocationEntryResponse[]> {
    const entries = await this.getStockByLocation.execute(actor, {
      locationId: LocationId.from(locationId),
    });
    return entries.map(serializeStockByLocationEntry);
  }

  @Get(':locationId/movements')
  async movements(
    @ActorParam() actor: Actor,
    @Param('locationId') locationId: string,
    @Query(new ZodValidationPipe(StockMovementsQuerySchema)) query: StockMovementsQuery,
  ): Promise<StockMovementResponse[]> {
    const movements = await this.getStockMovements.execute(actor, {
      locationId: LocationId.from(locationId),
      materialId: query.materialId ? MaterialId.from(query.materialId) : undefined,
    });
    return movements.map(serializeStockMovement);
  }
}
