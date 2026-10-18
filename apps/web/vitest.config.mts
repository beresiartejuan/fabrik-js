import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.mts'],
    /**
     * El timeout por defecto (5 s) queda corto cuando la máquina está cargada
     * (la suite corre en paralelo junto a otros procesos del repo): los tests
     * no son lentos en sí, los estira el contention. 15 s da margen sin
     * enmascarar fallas reales (los asserts son sincrónicos salvo `findBy*`).
     */
    testTimeout: 15_000,
  },
});
