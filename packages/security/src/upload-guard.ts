/**
 * Validación de archivos subidos (comprobantes de pago). No confiar NUNCA en
 * `Content-Type` ni en la extensión: se verifican los magic bytes.
 * Se aceptan solo imágenes y PDF. El archivo va a MinIO (fuera del webroot) y
 * se sirve únicamente por URL firmada.
 */

export const MAX_COMPROBANTE_BYTES = 5 * 1024 * 1024; // 5 MB

export type TipoArchivoPermitido = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

interface Firma {
  mime: TipoArchivoPermitido;
  ext: string;
  bytes: number[];
  offset?: number;
}

const FIRMAS: Firma[] = [
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  // WEBP: "RIFF"...."WEBP"
  { mime: 'image/webp', ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

export type UploadCheck =
  | { ok: true; mime: TipoArchivoPermitido; ext: string }
  | { ok: false; reason: string };

export function checkComprobante(buf: Uint8Array, declaredSize?: number): UploadCheck {
  if (buf.byteLength === 0) return { ok: false, reason: 'archivo vacío' };
  if (buf.byteLength > MAX_COMPROBANTE_BYTES || (declaredSize ?? 0) > MAX_COMPROBANTE_BYTES) {
    return { ok: false, reason: 'archivo supera 5 MB' };
  }

  for (const f of FIRMAS) {
    const off = f.offset ?? 0;
    if (buf.length < off + f.bytes.length) continue;
    let match = true;
    for (let i = 0; i < f.bytes.length; i++) {
      if (buf[off + i] !== f.bytes[i]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    if (f.mime === 'image/webp') {
      // confirmar "WEBP" en offset 8
      const webp = [0x57, 0x45, 0x42, 0x50];
      if (buf.length < 12 || webp.some((b, i) => buf[8 + i] !== b)) continue;
    }
    return { ok: true, mime: f.mime, ext: f.ext };
  }
  return { ok: false, reason: 'tipo de archivo no permitido (solo JPG, PNG, WEBP, PDF)' };
}

/** Nombre de objeto seguro para MinIO: sin path traversal, sin caracteres raros. */
export function safeObjectKey(sedeId: string, reservaId: string, ext: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const rand = crypto.randomUUID();
  return `comprobantes/${clean(sedeId)}/${clean(reservaId)}/${rand}.${clean(ext)}`;
}
