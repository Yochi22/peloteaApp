import { describe, it, expect } from 'vitest';
import { checkComprobante, safeObjectKey, MAX_COMPROBANTE_BYTES } from './upload-guard';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ header

describe('checkComprobante (magic bytes, no Content-Type)', () => {
  it('acepta un PNG real', () => {
    expect(checkComprobante(PNG)).toMatchObject({ ok: true, mime: 'image/png' });
  });

  it('acepta un JPG real', () => {
    expect(checkComprobante(JPG)).toMatchObject({ ok: true, mime: 'image/jpeg' });
  });

  it('acepta un PDF real', () => {
    expect(checkComprobante(PDF)).toMatchObject({ ok: true, mime: 'application/pdf' });
  });

  it('rechaza un ejecutable renombrado a .png (polyglot / spoof de extensión)', () => {
    const r = checkComprobante(EXE);
    expect(r.ok).toBe(false);
  });

  it('rechaza un archivo vacío', () => {
    expect(checkComprobante(new Uint8Array())).toMatchObject({ ok: false });
  });

  it('rechaza un archivo que excede el tamaño máximo', () => {
    const grande = new Uint8Array(MAX_COMPROBANTE_BYTES + 1);
    grande.set(PNG);
    expect(checkComprobante(grande)).toMatchObject({ ok: false });
  });

  it('detecta el tamaño declarado aunque el buffer real sea más chico', () => {
    expect(checkComprobante(PNG, MAX_COMPROBANTE_BYTES + 1)).toMatchObject({ ok: false });
  });
});

describe('safeObjectKey', () => {
  it('elimina intentos de path traversal', () => {
    const key = safeObjectKey('../../etc', '../passwd', 'png');
    expect(key).not.toContain('..');
    expect(key.startsWith('comprobantes/etc/passwd/')).toBe(true);
  });

  it('genera una clave distinta en cada llamada', () => {
    const a = safeObjectKey('sede1', 'reserva1', 'png');
    const b = safeObjectKey('sede1', 'reserva1', 'png');
    expect(a).not.toBe(b);
  });
});
