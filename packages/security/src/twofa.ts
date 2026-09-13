import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import * as OTPAuth from 'otpauth';

/**
 * 2FA por TOTP (Google Authenticator / Authy / etc). Obligatorio para roles
 * admin — ver CLAUDE.md §5. El secreto se guarda CIFRADO en `Usuario.twoFactorSecret`
 * (nunca en texto plano): `encryptSecret`/`decryptSecret` con AES-256-GCM,
 * clave derivada de `AUTH_SECRET` (nunca hardcodeada, nunca en el repo).
 */

const ISSUER = 'Pelotea';

export function generarSecretoTotp(): OTPAuth.Secret {
  return new OTPAuth.Secret({ size: 20 });
}

export function crearTotp(secret: OTPAuth.Secret | string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
}

/** URI `otpauth://...` para generar el QR de enrolamiento. */
export function uriTotp(secret: OTPAuth.Secret, email: string): string {
  return crearTotp(secret, email).toString();
}

/**
 * Valida un código de 6 dígitos con una ventana de ±1 período (30s) para
 * tolerar reloj desincronizado. Nunca lanza — un código con formato roto
 * simplemente no valida.
 */
export function verificarTotp(secretBase32: string, codigo: string): boolean {
  if (!/^\d{6}$/.test(codigo)) return false;
  try {
    const totp = crearTotp(OTPAuth.Secret.fromBase32(secretBase32), 'verificar');
    return totp.validate({ token: codigo, window: 1 }) !== null;
  } catch {
    return false;
  }
}

// ── Cifrado del secreto en reposo ───────────────────────────────────────────

function claveDesde(authSecret: string): Buffer {
  // SHA-256 del AUTH_SECRET → 32 bytes exactos para AES-256.
  return createHash('sha256').update(authSecret).digest();
}

export function encryptSecret(secretoPlano: string, authSecret: string): string {
  const key = claveDesde(authSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const cifrado = Buffer.concat([cipher.update(secretoPlano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv.tag.cifrado, todo en base64 — un solo string para guardar en la columna.
  return `${iv.toString('base64')}.${tag.toString('base64')}.${cifrado.toString('base64')}`;
}

export function decryptSecret(valorCifrado: string, authSecret: string): string {
  const [ivB64, tagB64, dataB64] = valorCifrado.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato de secreto 2FA inválido');
  const key = claveDesde(authSecret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plano = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return plano.toString('utf8');
}

// ── Códigos de recuperación (por si se pierde el dispositivo) ──────────────

/** 8 códigos de un solo uso, formato XXXX-XXXX. Se muestran UNA vez al activar 2FA. */
export function generarCodigosRecuperacion(cantidad = 8): string[] {
  return Array.from({ length: cantidad }, () => {
    const bytes = randomBytes(5).toString('hex').toUpperCase();
    return `${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
  });
}

/** Los códigos se guardan hasheados (SHA-256) — igual que un password, no en texto plano. */
export function hashCodigoRecuperacion(codigo: string): string {
  return createHash('sha256').update(codigo.trim().toUpperCase()).digest('hex');
}
