import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
// Imports por subpath (no el barrel completo): así las rutas que solo
// necesitan rate-limit/idempotencia no arrastran el binario nativo de
// @node-rs/argon2 (usado solo por password.ts) a su bundle de servidor.
import { RATE_LIMITS, type RateLimitPreset, rateLimit, rateLimitHeaders } from '@pelotea/security/rate-limit';
import * as idempotency from '@pelotea/security/idempotency';
import { redis } from './redis';

/**
 * Envoltura de seguridad para route handlers (runtime Node).
 * Hace, en orden:
 *   1. rate-limit por IP + preset
 *   2. idempotencia (si el preset la exige y llega `Idempotency-Key`)
 *   3. valida el body con un schema Zod
 * Devuelve `{ data }` para continuar, o un `NextResponse` de error para cortar.
 *
 * La CSRF ya la validó el middleware para /api/*.
 */

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export interface GuardOptions<S extends z.ZodTypeAny> {
  preset: RateLimitPreset;
  schema: S;
  /** Alcance de idempotencia; si se define, se aplica dedupe por Idempotency-Key. */
  idempotencyScope?: string;
  /** Discriminante extra para el rate-limit (p.ej. userId). */
  subject?: string;
}

export type GuardResult<T> =
  | { ok: true; data: T; ip: string; idempotencyKey: string | null; finish: (body: unknown) => Promise<void> }
  | { ok: false; response: NextResponse };

export async function guard<S extends z.ZodTypeAny>(
  req: NextRequest,
  opts: GuardOptions<S>,
): Promise<GuardResult<z.infer<S>>> {
  const ip = clientIp(req);
  const rule = RATE_LIMITS[opts.preset];
  const rlKey = `rl:${opts.preset}:${opts.subject ?? ip}`;
  const rl = await rateLimit(redis, rlKey, rule);
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'rate_limited', message: 'Demasiadas solicitudes. Intenta en un momento.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      ),
    };
  }

  // ── Idempotencia ────────────────────────────────────────────────────────
  const idemKey = req.headers.get('idempotency-key');
  if (opts.idempotencyScope) {
    if (!idempotency.isValidIdempotencyKey(idemKey)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'idempotency_key_required', message: 'Falta un header Idempotency-Key válido.' },
          { status: 400 },
        ),
      };
    }
    const hit = await idempotency.begin(redis, opts.idempotencyScope, idemKey);
    if (hit?.status === 'completed') {
      return { ok: false, response: NextResponse.json(hit.response ?? {}, { status: 200 }) };
    }
    if (hit?.status === 'in_progress') {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'in_progress', message: 'Esta operación ya se está procesando.' },
          { status: 409 },
        ),
      };
    }
  }

  // ── Validación de body ──────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    if (opts.idempotencyScope && idemKey) await idempotency.abort(redis, opts.idempotencyScope, idemKey);
    return { ok: false, response: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) };
  }

  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    if (opts.idempotencyScope && idemKey) await idempotency.abort(redis, opts.idempotencyScope, idemKey);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'validation', issues: parsed.error.flatten() },
        { status: 422 },
      ),
    };
  }

  const finish = async (body: unknown) => {
    if (opts.idempotencyScope && idemKey) {
      await idempotency.complete(redis, opts.idempotencyScope, idemKey, body);
    }
  };

  return { ok: true, data: parsed.data, ip, idempotencyKey: idemKey, finish };
}
