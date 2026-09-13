/**
 * Protección CSRF: doble verificación.
 *  1. Chequeo de Origin/Referer contra la lista de hosts permitidos (barato,
 *     bloquea la mayoría).
 *  2. Token double-submit: cookie `pl_csrf` (SameSite=Lax, no HttpOnly) que el
 *     cliente refleja en el header `x-csrf-token`; se comparan en tiempo constante.
 *
 * Los métodos seguros (GET/HEAD/OPTIONS) no se verifican.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_COOKIE = 'pl_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function newCsrfToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface CsrfCheckInput {
  method: string;
  originHeader: string | null;
  refererHeader: string | null;
  allowedOrigins: string[];
  cookieToken: string | null;
  headerToken: string | null;
}

export type CsrfVerdict = { ok: true } | { ok: false; reason: string };

export function verifyCsrf(input: CsrfCheckInput): CsrfVerdict {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true };

  const source = input.originHeader ?? input.refererHeader;
  if (!source) return { ok: false, reason: 'sin Origin ni Referer' };

  let originHost: string;
  try {
    originHost = new URL(source).origin;
  } catch {
    return { ok: false, reason: 'Origin inválido' };
  }
  if (!input.allowedOrigins.includes(originHost)) {
    return { ok: false, reason: 'Origin no permitido' };
  }

  if (!input.cookieToken || !input.headerToken) {
    return { ok: false, reason: 'falta token CSRF' };
  }
  if (!timingSafeEqual(input.cookieToken, input.headerToken)) {
    return { ok: false, reason: 'token CSRF no coincide' };
  }
  return { ok: true };
}
