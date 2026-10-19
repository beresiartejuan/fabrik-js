'use client';

import { MoreHorizontalIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Menú de acciones por fila de una tabla de catálogo (docs/pantallas.md
 * §Pantallas 3–6). El botón de puntos suspensivos despliega las acciones que la
 * pantalla declare; las deshabilitadas llevan su nota en `title`.
 */

export interface RowAction {
  readonly label: string;
  readonly onSelect: () => void;
  readonly variant?: 'default' | 'destructive';
  readonly disabled?: boolean;
  readonly disabledHint?: string;
}

export function RowActions({ actions }: { readonly actions: readonly RowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Acciones" />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.variant}
            disabled={action.disabled}
            title={action.disabled ? action.disabledHint : undefined}
            onClick={action.onSelect}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
