import { fireEvent, screen, waitFor, within } from '@testing-library/react';

/**
 * Interactúa con un `Select` de shadcn (base-ui) en jsdom: abre el trigger por
 * su `aria-label` y elige la opción. Base UI exige `pointerdown` + `click`
 * para confirmar una selección (un `click` "virtual" suelto no la activa).
 *
 * `scope` acota solo la búsqueda del **trigger** (p. ej. un diálogo abierto
 * sobre la pantalla, donde coexisten dos selects con la misma etiqueta detrás
 * del portal); la opción se busca en toda la pantalla porque el popup abre por
 * portal.
 */
export function selectOption(
  triggerLabel: string,
  optionName: string | RegExp,
  scope?: HTMLElement | null,
): void {
  const triggerQueries = scope ? within(scope) : screen;
  fireEvent.click(triggerQueries.getByLabelText(triggerLabel));
  const option = screen.getByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

/**
 * Variante asincrónica: espera a que el trigger exista y esté habilitado antes
 * de abrir, y a que la opción exista antes de elegir. La usa la pantalla de
 * asignaciones, cuyos selects cargan catálogo por HTTP (mientras cargan están
 * deshabilitados: un click temprano no abre el popup).
 *
 * Ojo: base-ui marca el trigger con `aria-disabled` (sin `disabled` nativo),
 * así que se chequean ambos.
 */
export async function selectOptionAsync(
  triggerLabel: string,
  optionName: string | RegExp,
  scope?: HTMLElement | null,
): Promise<void> {
  const triggerQueries = scope ? within(scope) : screen;
  const trigger = await triggerQueries.findByLabelText(triggerLabel);
  await waitFor(() => {
    if (trigger.hasAttribute('disabled') || trigger.getAttribute('aria-disabled') === 'true') {
      throw new Error(`El trigger «${triggerLabel}» sigue deshabilitado.`);
    }
  });
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}
