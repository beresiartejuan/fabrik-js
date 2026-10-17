import { cn } from 'cn';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/lib/format/labels';

/**
 * Badge de estado genérico (docs/10-plan-de-web.md §Pantallas 3–6). El tono es
 * una abstracción sobre las variantes de shadcn (`Badge`) para no repetir clases
 * de color en cada pantalla; los textos salen de `lib/format/labels.ts`.
 */

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/20 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  info: 'border-sky-500/20 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
};

export interface StatusBadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly className?: string;
}

export function StatusBadge({ tone = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[tone], className)}>
      {children}
    </Badge>
  );
}
