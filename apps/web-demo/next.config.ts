import type { NextConfig } from 'next';

/**
 * El build normal (server build con cache components) es la configuración por
 * defecto; el **modo export** (GitHub Pages) se activa solo con
 * `NEXT_EXPORT=1`:
 *
 * - `output: 'export'` escribe un sitio 100% estático en `out/`.
 * - `trailingSlash: true` emite `ruta/index.html` (GitHub Pages resuelve
 *   directorios a su `index.html`).
 * - `images.unoptimized: true` por defensión: el export no puede optimizar
 *   imágenes (el `loader` por defecto exige un server; hoy la app no usa
 *   `next/image`, pero la app no se rompe si alguien lo agrega).
 * - `cacheComponents`/`partialPrefetching` se **deshabilitan** porque el export
 *   es incompatible con PPR (`Invariant: PPR cannot be enabled in export
 *   mode`, ver `next/dist/export/index.js`). Se desactivan explícitamente para
 *   que el build de export falle siempre por lo mismo.
 *
 * `basePath` se aplica en cualquier modo si `NEXT_PUBLIC_BASE_PATH` está
 * definido (hoy solo lo define el workflow de GitHub Pages, que deriva
 * `/<repo>/` del origin).
 */
const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  ...(process.env.NEXT_EXPORT === '1'
    ? {
        output: 'export' as const,
        trailingSlash: true,
        images: { unoptimized: true },
        cacheComponents: false,
        partialPrefetching: false,
      }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
