'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

/** Alterna claro/oscuro (persistido por `next-themes`; el default sigue al sistema). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  );
}
