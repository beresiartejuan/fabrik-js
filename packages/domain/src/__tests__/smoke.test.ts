import { describe, expect, it } from 'vitest';

import * as domain from '../index.js';

describe('@fabrik/domain', () => {
  it('exporta el barrel de la capa de dominio', () => {
    expect(domain).toBeDefined();
  });

  it('el entorno de tests funciona', () => {
    expect(true).toBe(true);
  });
});
