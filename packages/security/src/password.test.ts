import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, loginBackoffSec } from './password';

describe('hashPassword / verifyPassword', () => {
  it('produce un hash que verifica correctamente', async () => {
    const hash = await hashPassword('contraseña-super-segura-1');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'contraseña-super-segura-1')).toBe(true);
  });

  it('rechaza la contraseña incorrecta', async () => {
    const hash = await hashPassword('contraseña-super-segura-1');
    expect(await verifyPassword(hash, 'otra-contraseña')).toBe(false);
  });

  it('rechaza contraseñas demasiado cortas', async () => {
    await expect(hashPassword('corta')).rejects.toThrow();
  });

  it('no lanza con un hash corrupto, solo devuelve false', async () => {
    expect(await verifyPassword('esto-no-es-un-hash', 'lo-que-sea')).toBe(false);
  });
});

describe('loginBackoffSec', () => {
  it('no penaliza los primeros intentos', () => {
    expect(loginBackoffSec(0)).toBe(0);
    expect(loginBackoffSec(2)).toBe(0);
  });

  it('escala el backoff con más fallos', () => {
    expect(loginBackoffSec(3)).toBeGreaterThan(0);
    expect(loginBackoffSec(8)).toBeGreaterThan(loginBackoffSec(3));
    expect(loginBackoffSec(12)).toBeGreaterThan(loginBackoffSec(8));
  });
});
