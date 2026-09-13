import { describe, it, expect } from 'vitest';
import { verifyCsrf, newCsrfToken } from './csrf';

const ALLOWED = ['https://pelotea.app'];

describe('verifyCsrf', () => {
  it('permite métodos seguros sin ningún token', () => {
    expect(verifyCsrf({ method: 'GET', originHeader: null, refererHeader: null, allowedOrigins: ALLOWED, cookieToken: null, headerToken: null }).ok).toBe(true);
  });

  it('rechaza una mutación sin Origin ni Referer', () => {
    const v = verifyCsrf({ method: 'POST', originHeader: null, refererHeader: null, allowedOrigins: ALLOWED, cookieToken: 't', headerToken: 't' });
    expect(v.ok).toBe(false);
  });

  it('rechaza un Origin fuera de la allowlist (ataque cross-site)', () => {
    const v = verifyCsrf({
      method: 'POST',
      originHeader: 'https://evil.example',
      refererHeader: null,
      allowedOrigins: ALLOWED,
      cookieToken: 't',
      headerToken: 't',
    });
    expect(v.ok).toBe(false);
  });

  it('rechaza si el token del header no coincide con el de la cookie', () => {
    const v = verifyCsrf({
      method: 'POST',
      originHeader: 'https://pelotea.app',
      refererHeader: null,
      allowedOrigins: ALLOWED,
      cookieToken: newCsrfToken(),
      headerToken: newCsrfToken(),
    });
    expect(v.ok).toBe(false);
  });

  it('acepta cuando Origin está permitido y los tokens coinciden', () => {
    const token = newCsrfToken();
    const v = verifyCsrf({
      method: 'POST',
      originHeader: 'https://pelotea.app',
      refererHeader: null,
      allowedOrigins: ALLOWED,
      cookieToken: token,
      headerToken: token,
    });
    expect(v.ok).toBe(true);
  });
});
