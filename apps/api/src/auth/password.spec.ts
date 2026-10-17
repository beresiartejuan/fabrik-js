import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword, type ScryptParams } from './password.js';

describe('password (scrypt)', () => {
  it('hashea y verifica la contraseña correcta', async () => {
    const encoded = await hashPassword('s3creto');
    expect(encoded).toMatch(/^scrypt\$N=\d+,r=\d+,p=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    await expect(verifyPassword('s3creto', encoded)).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const encoded = await hashPassword('s3creto');
    await expect(verifyPassword('otra', encoded)).resolves.toBe(false);
  });

  it('usa una sal nueva en cada hash (misma contraseña, hash distinto)', async () => {
    const first = await hashPassword('igual');
    const second = await hashPassword('igual');
    expect(first).not.toBe(second);
    await expect(verifyPassword('igual', first)).resolves.toBe(true);
    await expect(verifyPassword('igual', second)).resolves.toBe(true);
  });

  it('devuelve false ante un hash malformado en vez de lanzar', async () => {
    await expect(verifyPassword('x', 'no-es-un-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$N=1,r=1,p=1$aa$bb')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$N=16384,r=8,p=1$aa')).resolves.toBe(false);
  });

  it('respeta parámetros personalizados y los codifica', async () => {
    const params: ScryptParams = { N: 2 ** 12, r: 8, p: 1, keyLength: 32 };
    const encoded = await hashPassword('clave', params);
    expect(encoded).toContain('scrypt$N=4096,r=8,p=1$');
    await expect(verifyPassword('clave', encoded)).resolves.toBe(true);
  });
});
