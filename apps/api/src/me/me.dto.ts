import type { AssignmentResponse } from '../assignments/assignments.dto.js';
import type { MachineResponse } from '../machines/machines.dto.js';

/**
 * DTOs del recurso `me` (post-plan, auditoría MEDIA #2).
 *
 * `GET /me/schedule` devuelve la agenda del **propio** actor con `activeNow`
 * calculado en el servidor. El cálculo se hace aquí (no en el cliente) porque
 * `TimeSlot.contains` evalúa la franja en la **zona local del servidor**, que es
 * la fuente de verdad de I3: el navegador puede estar en otra zona horaria y
 * mostraría un estado distinto al que aplicará `RecordTransformation`.
 */
export interface MeScheduleItemResponse extends AssignmentResponse {
  readonly machine: MachineResponse | null;
  /**
   * `assignment.slot.contains(new Date())` evaluado en el proceso servidor en el
   * momento de la petición. `true` = el actor puede registrar transformaciones en
   * esta máquina ahora mismo (I3).
   */
  readonly activeNow: boolean;
}
