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
  CreateRecipe,
  GetRecipe,
  ListRecipes,
  MaterialId,
  Quantity,
  RecipeId,
  UpdateRecipe,
  type Actor,
  type RecipeStepProps,
} from '@fabrik/domain';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import {
  CreateRecipeSchema,
  ListRecipesQuerySchema,
  UpdateRecipeSchema,
  serializeRecipe,
  type CreateRecipeDto,
  type ListRecipesQuery,
  type RecipeResponse,
  type RecipeStepDto,
  type UpdateRecipeDto,
} from './recipes.dto.js';

/**
 * Catálogo de recetas (Fase 4, docs/09). RBAC en el dominio.
 *
 * Traducción wire → dominio: los ids de material y las cantidades se reconstruyen
 * con `MaterialId.from`/`Quantity.create`, de modo que los invariantes (I7,
 * posiciones consecutivas, `amount > 0`) los siga validando el dominio.
 */
@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly createRecipe: CreateRecipe,
    private readonly updateRecipe: UpdateRecipe,
    private readonly getRecipe: GetRecipe,
    private readonly listRecipes: ListRecipes,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(CreateRecipeSchema)) body: CreateRecipeDto,
  ): Promise<RecipeResponse> {
    const recipe = await this.createRecipe.execute(actor, {
      name: body.name,
      outputProductId: MaterialId.from(body.outputProductId),
      outputQuantity: Quantity.create(body.outputQuantity.amount, body.outputQuantity.unit),
      steps: body.steps.map(toStepProps),
    });
    return serializeRecipe(recipe);
  }

  @Get()
  async list(
    @ActorParam() actor: Actor,
    @Query(new ZodValidationPipe(ListRecipesQuerySchema)) query: ListRecipesQuery,
  ): Promise<RecipeResponse[]> {
    const recipes = await this.listRecipes.execute(actor, {
      filter: {
        outputProductId: query.outputProductId
          ? MaterialId.from(query.outputProductId)
          : undefined,
      },
    });
    return recipes.map(serializeRecipe);
  }

  @Get(':id')
  async get(@ActorParam() actor: Actor, @Param('id') id: string): Promise<RecipeResponse> {
    const recipe = await this.getRecipe.execute(actor, { id: RecipeId.from(id) });
    return serializeRecipe(recipe);
  }

  @Patch(':id')
  async update(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRecipeSchema)) body: UpdateRecipeDto,
  ): Promise<RecipeResponse> {
    const recipe = await this.updateRecipe.execute(actor, {
      id: RecipeId.from(id),
      name: body.name,
      outputProductId: body.outputProductId ? MaterialId.from(body.outputProductId) : undefined,
      outputQuantity: body.outputQuantity
        ? Quantity.create(body.outputQuantity.amount, body.outputQuantity.unit)
        : undefined,
      steps: body.steps?.map(toStepProps),
    });
    return serializeRecipe(recipe);
  }
}

function toStepProps(step: RecipeStepDto): RecipeStepProps {
  return {
    position: step.position,
    machineType: step.machineType,
    inputs: step.inputs.map((input) => ({
      materialId: MaterialId.from(input.materialId),
      quantity: Quantity.create(input.quantity.amount, input.quantity.unit),
    })),
    outputProductId: MaterialId.from(step.outputProductId),
    outputQuantity: Quantity.create(step.outputQuantity.amount, step.outputQuantity.unit),
  };
}
