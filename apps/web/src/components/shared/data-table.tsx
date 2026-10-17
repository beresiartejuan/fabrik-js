'use client';

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import { EmptyState } from '@/components/shared/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Tabla de catálogo con búsqueda y orden **locales** (docs/10-plan-de-web.md
 * §Pantallas 3–6). No hay paginación en la API (gap documentado), así que el
 * filtrado/orden se hace en cliente sobre el listado completo.
 *
 * Genérica y tipada: cada pantalla declara sus columnas y, opcionalmente, cómo
 * obtener el texto de búsqueda (`searchValue`) y el valor de orden (`sortValue`).
 */

export interface DataTableColumn<T> {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** Si se define, la cabecera es un botón de orden por esta clave. */
  readonly sortValue?: (row: T) => string | number;
  readonly headerClassName?: string;
  readonly cellClassName?: string;
}

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowId: (row: T) => string;
  readonly loading?: boolean;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  /** Texto sobre el que busca el filtro local (por defecto: campos string del row). */
  readonly searchValue?: (row: T) => string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyAction?: ReactNode;
}

interface SortState {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}

function defaultSearchValue<T>(row: T): string {
  if (row && typeof row === 'object') {
    return Object.values(row as Record<string, unknown>)
      .filter((value) => typeof value === 'string')
      .join(' ');
  }
  return String(row);
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  searchable = false,
  searchPlaceholder = 'Buscar…',
  searchValue,
  emptyTitle = 'No hay registros',
  emptyDescription,
  emptyAction,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);

  const toSearchText = searchValue ?? defaultSearchValue<T>;

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    const filtered =
      searchable && normalized.length > 0
        ? rows.filter((row) => toSearchText(row).toLocaleLowerCase('es').includes(normalized))
        : [...rows];

    if (!sort) {
      return filtered;
    }
    const column = columns.find((candidate) => candidate.id === sort.columnId);
    if (!column?.sortValue) {
      return filtered;
    }
    const sortValue = column.sortValue;
    return filtered.sort((a, b) => {
      const result = compare(sortValue(a), sortValue(b));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [columns, query, rows, searchable, sort, toSearchText]);

  function toggleSort(columnId: string): void {
    setSort((current) => {
      if (current?.columnId !== columnId) {
        return { columnId, direction: 'asc' };
      }
      return { columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  }

  const hasFilter = searchable && query.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-xl border bg-background">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="border-b px-3 py-3 last:border-b-0">
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={hasFilter ? 'No se encontraron resultados' : emptyTitle}
          description={
            hasFilter ? `No hay registros que coincidan con «${query.trim()}».` : emptyDescription
          }
          action={hasFilter ? undefined : emptyAction}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {columns.map((column) => (
                  <TableHead key={column.id} className={column.headerClassName}>
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className="inline-flex items-center gap-1 rounded-sm text-left hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                        aria-label={`Ordenar por ${column.header}`}
                      >
                        {column.header}
                        <SortIcon
                          active={sort?.columnId === column.id}
                          direction={sort?.direction}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn('whitespace-normal', column.cellClassName)}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SortIcon({
  active,
  direction,
}: {
  readonly active: boolean;
  readonly direction?: 'asc' | 'desc';
}) {
  if (!active) {
    return <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />;
  }
  return direction === 'desc' ? (
    <ArrowDownIcon className="size-3.5" aria-hidden="true" />
  ) : (
    <ArrowUpIcon className="size-3.5" aria-hidden="true" />
  );
}
