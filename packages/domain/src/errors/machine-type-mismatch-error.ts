import type { MachineType } from '../entities/machine.js';
import type { MachineId, RecipeStepId } from '../value-objects/ids.js';

import { DomainError } from './domain-error.js';

// El paso de receta exige un tipo de máquina distinto al de la máquina usada en
// la transformación (docs/04, `RecordTransformation`).
export class MachineTypeMismatchError extends DomainError {
  readonly recipeStepId: RecipeStepId;
  readonly expected: MachineType;
  readonly received: MachineType;
  readonly machineId?: MachineId;

  constructor(
    recipeStepId: RecipeStepId,
    expected: MachineType,
    received: MachineType,
    machineId?: MachineId,
  ) {
    const subject = machineId ? ` la máquina ${machineId}` : ' la máquina usada';
    super(
      `El paso de receta ${recipeStepId} requiere una máquina de tipo "${expected}";${subject} es de tipo "${received}"`,
    );
    this.name = 'MachineTypeMismatchError';
    this.recipeStepId = recipeStepId;
    this.expected = expected;
    this.received = received;
    this.machineId = machineId;
  }
}
