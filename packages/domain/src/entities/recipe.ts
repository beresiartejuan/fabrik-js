import { RecipeIntegrityError } from '../errors/index.js';
import { RecipeId, RecipeStepId, type MaterialId } from '../value-objects/ids.js';
import type { Quantity } from '../value-objects/quantity.js';

import type { MachineType } from './machine.js';

// Material + cantidad requerida/producida por un paso de receta.
export interface MaterialQuantity {
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
}

export interface RecipeStepProps {
  readonly position: number;
  readonly machineType: MachineType;
  readonly inputs: readonly MaterialQuantity[];
  readonly outputProductId: MaterialId;
  readonly outputQuantity: Quantity;
}

export interface RecipeStepSnapshot extends RecipeStepProps {
  readonly id: RecipeStepId;
}

/**
 * Paso inmutable de una receta. Su coherencia de orden (posiciones 1..N) y de
 * output final la garantiza el agregado Recipe, que conoce el conjunto completo.
 */
export class RecipeStep {
  readonly id: RecipeStepId;
  readonly position: number;
  readonly machineType: MachineType;
  readonly inputs: readonly MaterialQuantity[];
  readonly outputProductId: MaterialId;
  readonly outputQuantity: Quantity;

  private constructor(snapshot: RecipeStepSnapshot) {
    this.id = snapshot.id;
    this.position = snapshot.position;
    this.machineType = snapshot.machineType;
    this.inputs = Object.freeze(snapshot.inputs.map((input) => Object.freeze({ ...input })));
    this.outputProductId = snapshot.outputProductId;
    this.outputQuantity = snapshot.outputQuantity;
    Object.freeze(this);
  }

  /** Crea un paso nuevo (id autogenerado). */
  static create(props: RecipeStepProps): RecipeStep {
    return RecipeStep.build({ ...props, id: RecipeStepId.create() });
  }

  /** Reconstituye un paso ya persistido. */
  static fromPersistence(snapshot: RecipeStepSnapshot): RecipeStep {
    return RecipeStep.build(snapshot);
  }

  private static build(snapshot: RecipeStepSnapshot): RecipeStep {
    return new RecipeStep(snapshot);
  }
}

export interface RecipeProps {
  readonly name: string;
  readonly outputProductId: MaterialId;
  readonly outputQuantity: Quantity;
  readonly steps: readonly RecipeStep[];
}

export interface RecipeSnapshot extends RecipeProps {
  readonly id: RecipeId;
}

/**
 * Cadena ordenada e inmutable de pasos para fabricar un producto (docs/02).
 * Valida, en construcción:
 *  - al menos un paso;
 *  - posiciones consecutivas empezando en 1;
 *  - I7: el output del último paso coincide con el output de la receta.
 */
export class Recipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly outputProductId: MaterialId;
  readonly outputQuantity: Quantity;
  readonly steps: readonly RecipeStep[];

  private constructor(snapshot: RecipeSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.outputProductId = snapshot.outputProductId;
    this.outputQuantity = snapshot.outputQuantity;
    this.steps = Object.freeze([...snapshot.steps]);
    Object.freeze(this);
  }

  /** Crea una receta nueva (id autogenerado) validando su integridad. */
  static create(props: RecipeProps): Recipe {
    return Recipe.build({ ...props, id: RecipeId.create() });
  }

  /** Reconstituye una receta ya persistida. */
  static fromPersistence(snapshot: RecipeSnapshot): Recipe {
    return Recipe.build(snapshot);
  }

  private static build(snapshot: RecipeSnapshot): Recipe {
    const steps = Recipe.validateSteps(snapshot.id, snapshot.steps, snapshot.outputProductId);
    return new Recipe({ ...snapshot, steps });
  }

  private static validateSteps(
    recipeId: RecipeId,
    steps: readonly RecipeStep[],
    outputProductId: MaterialId,
  ): readonly RecipeStep[] {
    if (steps.length === 0) {
      throw new RecipeIntegrityError(recipeId, 'la receta debe tener al menos un paso');
    }
    const sorted = [...steps].sort((a, b) => a.position - b.position);
    sorted.forEach((step, index) => {
      const expected = index + 1;
      if (step.position !== expected) {
        throw new RecipeIntegrityError(
          recipeId,
          `las posiciones deben ser consecutivas empezando en 1 (se esperaba ${expected} y se encontró ${step.position})`,
        );
      }
    });
    const lastStep = sorted[sorted.length - 1];
    if (lastStep.outputProductId !== outputProductId) {
      throw new RecipeIntegrityError(
        recipeId,
        'el output del último paso debe coincidir con el output de la receta (I7)',
      );
    }
    return sorted;
  }
}
