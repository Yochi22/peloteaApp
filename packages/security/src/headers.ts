/**
 * Cabeceras de seguridad y CSP. Se aplican en `apps/web/middleware.ts` a TODA
 * respuesta. La CSP es estricta y basada en nonce — nada de 'unsafe-inline'
 * para scripts.
 */

export interface CspOptions {
  nonce: string;
  /** Orígenes extra permitidos para conexiones (p.ej. Sentry). */
  connectSrc?: string[];
  /** true en dev: habilita HMR / eval de Next. */
  dev?: boolean;
  /** Origen de assets de MinIO/S3 para imágenes (URLs firmadas). */
  mediaOrigin?: string;
}

export function buildCsp({ nonce, connectSrc = [], dev = false, mediaOrigin }: CspOptions): string {
  const img = ["'self'", 'data:', 'blob:'];
  if (mediaOrigin) img.push(mediaOrigin);

  const connect = ["'self'"];
  if (mediaOrigin) connect.push(mediaOrigin);
  connect.push(...connectSrc);
  if (dev) connect.push('ws:', 'wss:');

  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (dev) script.push("'unsafe-eval'");

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `script-src ${script.join(' ')}`,
    // styled-jsx / inline styles del DS necesitan 'unsafe-inline' para estilos (no scripts)
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${img.join(' ')}`,
    `font-src 'self' data:`,
    `connect-src ${connect.join(' ')}`,
    `manifest-src 'self'`,
    `worker-src 'self' blob:`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export function securityHeaders(csp: string): Record<string, string> {
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'off',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(self), browsing-topics=(), interest-cohort=()',
    // HSTS: activar solo tras confirmar HTTPS estable en prod.
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  };
}

/** Genera un nonce criptográfico por request (base64). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
