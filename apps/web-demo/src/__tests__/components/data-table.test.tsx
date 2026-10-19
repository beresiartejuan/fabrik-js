import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable, type DataTableColumn } from '@/components/shared/data-table';

interface Row {
  readonly id: string;
  readonly name: string;
}

const ROWS: Row[] = [
  { id: '1', name: 'Zanahoria' },
  { id: '2', name: 'Aceite' },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Nombre', cell: (row) => row.name, sortValue: (row) => row.name },
];

/**
 * `DataTable` (docs/pantallas.md §Fase 1): estado vacío, búsqueda local y
 * orden por columna.
 */

describe('DataTable', () => {
  it('muestra el estado vacío en español cuando no hay filas', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        getRowId={(row) => row.id}
        emptyTitle="Todavía no hay materiales"
        emptyDescription="Creá el primer material."
      />,
    );

    expect(screen.getByText('Todavía no hay materiales')).toBeInTheDocument();
    expect(screen.getByText('Creá el primer material.')).toBeInTheDocument();
  });

  it('filtra por búsqueda y avisa cuando no hay coincidencias', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        searchable
        searchPlaceholder="Buscar…"
        searchValue={(row) => row.name}
      />,
    );

    fireEvent.change(screen.getByLabelText('Buscar…'), { target: { value: 'aceite' } });

    expect(screen.getByText('Aceite')).toBeInTheDocument();
    expect(screen.queryByText('Zanahoria')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar…'), { target: { value: 'zzz' } });

    expect(screen.getByText('No se encontraron resultados')).toBeInTheDocument();
  });

  it('ordena por columna al hacer click en la cabecera', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Nombre' }));

    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['Aceite', 'Zanahoria']);
  });
});
