import { fireEvent, screen } from '@testing-library/react';

/**
 * Interactúa con un `Select` de shadcn (base-ui) en jsdom: abre el trigger por su
 * `aria-label` y elige la opción. Base UI exige `pointerdown` + `click` para
 * confirmar una selección (un `click` "virtual" suelto no la activa).
 */
export function selectOption(triggerLabel: string, optionName: string | RegExp): void {
  fireEvent.click(screen.getByLabelText(triggerLabel));
  const option = screen.getByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}
