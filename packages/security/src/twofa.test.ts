import { describe, it, expect } from 'vitest';
import {
  generarSecretoTotp,
  crearTotp,
  verificarTotp,
  encryptSecret,
  decryptSecret,
  generarCodigosRecuperacion,
  hashCodigoRecuperacion,
} from './twofa.js';

describe('TOTP', () => {
  it('acepta el código válido del momento', () => {
    const secret = generarSecretoTotp();
    const codigo = crearTotp(secret, 'test@pelotea.app').generate();
    expect(verificarTotp(secret.base32, codigo)).toBe(true);
  });

  it('rechaza un código incorrecto', () => {
    const secret = generarSecretoTotp();
    expect(verificarTotp(secret.base32, '000000')).toBe(false);
  });

  it('rechaza un código con formato inválido sin lanzar', () => {
    const secret = generarSecretoTotp();
    expect(verificarTotp(secret.base32, 'abcdef')).toBe(false);
    expect(verificarTotp(secret.base32, '123')).toBe(false);
  });

  it('un código de una cuenta no sirve para otra', () => {
    const secretA = generarSecretoTotp();
    const secretB = generarSecretoTotp();
    const codigoA = crearTotp(secretA, 'a@pelotea.app').generate();
    expect(verificarTotp(secretB.base32, codigoA)).toBe(false);
  });
});

describe('cifrado del secreto (AES-256-GCM)', () => {
  const authSecret = 'clave-de-prueba-no-usar-en-produccion';

  it('cifra y descifra de vuelta al valor original', () => {
    const secreto = generarSecretoTotp().base32;
    const cifrado = encryptSecret(secreto, authSecret);
    expect(cifrado).not.toContain(secreto);
    expect(decryptSecret(cifrado, authSecret)).toBe(secreto);
  });

  it('no descifra con la clave equivocada', () => {
    const cifrado = encryptSecret('un-secreto', authSecret);
    expect(() => decryptSecret(cifrado, 'otra-clave-distinta')).toThrow();
  });
});

describe('códigos de recuperación', () => {
  it('genera 8 códigos únicos con formato XXXX-XXXX', () => {
    const codigos = generarCodigosRecuperacion();
    expect(codigos).toHaveLength(8);
    expect(new Set(codigos).size).toBe(8);
    for (const c of codigos) expect(c).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('el hash es determinístico e ignora mayúsculas/espacios', () => {
    const h1 = hashCodigoRecuperacion('ab12-cd34');
    const h2 = hashCodigoRecuperacion(' AB12-CD34 ');
    expect(h1).toBe(h2);
  });
});
