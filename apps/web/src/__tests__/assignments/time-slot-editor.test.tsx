import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  createEmptySlotDraft,
  type SlotDraftIssue,
  type TimeSlotDraft,
  validateSlotDraft,
} from '@/components/assignments/time-slot-draft';
import { TimeSlotEditor } from '@/components/assignments/time-slot-editor';

/**
 * Editor de `TimeSlot` (docs/pantallas.md §Pantalla 8): los toggles de día
 * arman la lista de días y las horas se validan inline (`HH:mm`, `end` admite
 * `24:00`, `start < end`, >= 1 día) sin dejar pasar nada al padre.
 */

function EditorHarness({ initial }: { readonly initial?: TimeSlotDraft }) {
  const base = initial ?? createEmptySlotDraft();
  const [draft, setDraft] = useState<TimeSlotDraft>(base);
  const [issues, setIssues] = useState<readonly SlotDraftIssue[]>(
    () => validateSlotDraft(base).issues,
  );

  return (
    <>
      <TimeSlotEditor
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setIssues(validateSlotDraft(next).issues);
        }}
        issues={issues}
      />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}

describe('TimeSlotEditor', () => {
  it('los toggles de día arman y desarma la lista (lunes primero)', () => {
    render(<EditorHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Día lun' }));
    fireEvent.click(screen.getByRole('button', { name: 'Día mié' }));
    expect(screen.getByTestId('draft')).toHaveTextContent('"days":[1,3]');

    fireEvent.click(screen.getByRole('button', { name: 'Día lun' }));
    expect(screen.getByTestId('draft')).toHaveTextContent('"days":[3]');
  });

  it('exige al menos un día cuando el borrador arranca vacío', () => {
    render(<EditorHarness />);

    expect(screen.getByText('Elegí al menos un día.')).toBeInTheDocument();
  });

  it('muestra el error de formato de hora y se corrige con HH:mm válido', () => {
    render(<EditorHarness initial={{ days: [1], start: '8:00', end: '16:00' }} />);

    expect(screen.getByText('La hora de inicio debe tener formato HH:mm.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de inicio (HH:mm)')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(screen.getByLabelText('Hora de inicio (HH:mm)'), {
      target: { value: '08:00' },
    });
    expect(
      screen.queryByText('La hora de inicio debe tener formato HH:mm.'),
    ).not.toBeInTheDocument();
  });

  it('acepta 24:00 como hora de fin (fin de jornada) y valida start < end', () => {
    render(<EditorHarness initial={{ days: [1], start: '22:00', end: '16:00' }} />);

    expect(
      screen.getByText('La hora de inicio debe ser anterior a la de fin.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Hora de fin (HH:mm o 24:00)'), {
      target: { value: '24:00' },
    });
    expect(
      screen.queryByText('La hora de inicio debe ser anterior a la de fin.'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('draft')).toHaveTextContent('"end":"24:00"');
  });
});
