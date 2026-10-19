'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Diálogo de confirmación para acciones destructivas o irreversibles
 * (docs/10-plan-de-web.md §Pantallas 3–6). Gestiona el estado `busy`: mientras
 * `onConfirm` está en vuelo el botón queda deshabilitado y el diálogo se cierra
 * **solo** si la promesa resuelve; si rechaza, permanece abierto para que la
 * pantalla muestre el error (toast).
 */

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm(): Promise<void> {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // La pantalla ya muestra el error; el diálogo queda abierto.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>
            {cancelLabel}
          </DialogClose>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
