import { NextResponse, type NextRequest } from 'next/server';
// Import edge-safe: sin argon2 ni ioredis (el middleware corre en Edge).
import {
  buildCsp,
  securityHeaders,
  generateNonce,
  verifyCsrf,
  newCsrfToken,
  CSRF_COOKIE,
  CSRF_HEADER,
} from '@pelotea/security/edge';

/**
 * Middleware de seguridad. Corre en TODA request.
 *  - CSP por nonce + cabeceras de seguridad
 *  - Cookie CSRF double-submit (se siembra si falta)
 *  - Verificación CSRF (Origin allowlist + token) en métodos mutantes
 *
 * El rate-limiting con Redis y la idempotencia viven en los route handlers
 * (runtime Node) vía `withGuard`, no acá — el middleware Edge no habla con Redis.
 */

const ALLOWED_ORIGINS = (process.env.APP_BASE_URL ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

const DEV = process.env.NODE_ENV !== 'production';

export function middleware(req: NextRequest) {
  const nonce = generateNonce();
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const isApi = req.nextUrl.pathname.startsWith('/api/');

  // ── CSRF en mutaciones de API ────────────────────────────────────────────
  if (isMutating && isApi) {
    const verdict = verifyCsrf({
      method: req.method,
      originHeader: req.headers.get('origin'),
      refererHeader: req.headers.get('referer'),
      allowedOrigins: ALLOWED_ORIGINS,
      cookieToken: req.cookies.get(CSRF_COOKIE)?.value ?? null,
      headerToken: req.headers.get(CSRF_HEADER),
    });
    if (!verdict.ok) {
      return NextResponse.json(
        { error: 'csrf', message: `Solicitud rechazada: ${verdict.reason}` },
        { status: 403 },
      );
    }
  }

  // ── Propagar nonce a la app ──────────────────────────────────────────────
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // ── Cabeceras de seguridad + CSP ────────────────────────────────────────
  const csp = buildCsp({
    nonce,
    dev: DEV,
    mediaOrigin: process.env.S3_PUBLIC_ORIGIN,
    connectSrc: process.env.SENTRY_DSN ? [new URL(process.env.SENTRY_DSN).origin] : [],
  });
  for (const [k, v] of Object.entries(securityHeaders(csp))) res.headers.set(k, v);
  if (DEV) res.headers.delete('Strict-Transport-Security');

  // ── Sembrar cookie CSRF si falta ────────────────────────────────────────
  if (!req.cookies.get(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, newCsrfToken(), {
      sameSite: 'lax',
      secure: !DEV,
      path: '/',
      httpOnly: false, // el cliente debe leerla para reflejarla en el header
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return res;
}

export const config = {
  // Excluir estáticos y assets de Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)'],
};
