import { describe, expect, it } from 'vitest';

import { JwtError, hashToken, secureEqual, signJwt, verifyJwt } from './jwt.js';

const SECRET = 'secreto-de-prueba';

describe('jwt (HMAC-SHA256 manual)', () => {
  it('firma y verifica un token conservando los claims', () => {
    const token = signJwt(
      { sub: 'worker-1', role: 'admin', typ: 'access' },
      SECRET,
      { expiresInSeconds: 900, now: 1_000 },
    );
    expect(token.split('.')).toHaveLength(3);

    const payload = verifyJwt(token, SECRET, { now: 1_500 });
    expect(payload).toMatchObject({ sub: 'worker-1', role: 'admin', typ: 'access', iat: 1_000, exp: 1_900 });
  });

  it('rechaza la firma con otro secreto', () => {
    const token = signJwt({ sub: 'w' }, SECRET, { expiresInSeconds: 60, now: 0 });
    expect(() => verifyJwt(token, 'otro', { now: 1 })).toThrow(JwtError);
    try {
      verifyJwt(token, 'otro', { now: 1 });
    } catch (error) {
      expect((error as JwtError).reason).toBe('signature');
    }
  });

  it('detecta un payload manipulado (la firma deja de cuadrar)', () => {
    const token = signJwt({ sub: 'w', role: 'auditor' }, SECRET, { expiresInSeconds: 60, now: 0 });
    const [header, , signature] = token.split('.');
    const forged = `${header}.${Buffer.from(JSON.stringify({ sub: 'w', role: 'admin', iat: 0, exp: 60 })).toString('base64url')}.${signature}`;
    expect(() => verifyJwt(forged, SECRET, { now: 1 })).toThrow(JwtError);
  });

  it('rechaza un token vencido', () => {
    const token = signJwt({ sub: 'w' }, SECRET, { expiresInSeconds: 10, now: 0 });
    expect(() => verifyJwt(token, SECRET, { now: 10 })).toThrow(JwtError);
    try {
      verifyJwt(token, SECRET, { now: 10 });
    } catch (error) {
      expect((error as JwtError).reason).toBe('expired');
    }
  });

  it('rechaza un token malformado', () => {
    expect(() => verifyJwt('a.b', SECRET)).toThrow(JwtError);
    expect(() => verifyJwt('a.b.c', SECRET)).toThrow(JwtError);
    try {
      verifyJwt('a.b', SECRET);
    } catch (error) {
      expect((error as JwtError).reason).toBe('malformed');
    }
  });

  it('rechaza segmentos base64url no canónicos (padding "=" o espacios)', () => {
    const token = signJwt({ sub: 'w' }, SECRET, { expiresInSeconds: 60, now: 0 });
    const [header, payload, signature] = token.split('.') as [string, string, string];

    const malformed = [
      `${signature}=`, // padding de base64 clásico, prohibido en base64url
      ` ${signature}`, // espacio dentro del segmento de firma
      `${header}=.${payload}.${signature}`, // padding en el header
      `${header}.${payload} .${signature}`, // espacio en el payload
    ];
    for (const bad of malformed) {
      expect(() => verifyJwt(bad, SECRET, { now: 1 })).toThrow(JwtError);
      try {
        verifyJwt(bad, SECRET, { now: 1 });
      } catch (error) {
        expect((error as JwtError).reason).toBe('malformed');
      }
    }
  });

  it('hashToken es determinista y secureEqual compara sin filtrar longitud', () => {
    expect(hashToken('token')).toBe(hashToken('token'));
    expect(hashToken('token')).not.toBe(hashToken('otro'));
    expect(secureEqual('abc', 'abc')).toBe(true);
    expect(secureEqual('abc', 'abd')).toBe(false);
    expect(secureEqual('abc', 'abcd')).toBe(false);
  });
});
