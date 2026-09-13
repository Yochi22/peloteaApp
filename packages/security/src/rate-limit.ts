import type Redis from 'ioredis';

/**
 * Rate limiting con ventana deslizante sobre Redis (sorted set). Atómico vía
 * pipeline. Se aplica a TODO endpoint mutante; presets más estrictos para auth,
 * aprobación de pago y uploads. Defiende contra fuerza bruta y DoS de capa 7.
 */

export interface RateLimitRule {
  /** Máximo de solicitudes permitidas en la ventana. */
  limit: number;
  /** Ventana en segundos. */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Segundos hasta poder reintentar (solo si !ok). */
  retryAfterSec: number;
  limit: number;
}

export const RATE_LIMITS = {
  /** Lecturas / navegación general por IP. */
  global: { limit: 300, windowSec: 60 },
  /** Endpoints que mutan estado (crear reserva, unirse a partido, etc.). */
  mutation: { limit: 40, windowSec: 60 },
  /** Login / registro / reset — por IP y por identificador. */
  auth: { limit: 8, windowSec: 300 },
  /** Envío de comprobante / upload de archivos. */
  upload: { limit: 12, windowSec: 300 },
  /** Aprobar/rechazar pago (staff). */
  paymentReview: { limit: 120, windowSec: 60 },
  /** Endpoints que disparan notificaciones. */
  notify: { limit: 20, windowSec: 3600 },
  /**
   * Reservar como invitado (sin cuenta): más estricto que `mutation` — cada
   * intento crea un Usuario invitado y toma un HOLD real. Sin este límite,
   * alguien sin cuenta podría acaparar todos los turnos de un club a
   * repetición (DoS de disponibilidad) sin siquiera registrarse.
   */
  guestBooking: { limit: 5, windowSec: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitPreset = keyof typeof RATE_LIMITS;

/**
 * @param key  identificador estable del cliente + recurso, p.ej.
 *             `rl:mutation:${ip}` o `rl:auth:${emailHash}`.
 */
export async function rateLimit(
  redis: Redis,
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSec * 1000;
  const clearBefore = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

  const res = await redis
    .multi()
    .zremrangebyscore(key, 0, clearBefore)
    .zadd(key, now, member)
    .zcard(key)
    .pexpire(key, windowMs)
    .exec();

  // res[2] === [err, count]
  const count = Number(res?.[2]?.[1] ?? 0);
  const ok = count <= rule.limit;

  if (!ok) {
    // quitar la propia entrada: no cuenta cuando fue rechazada
    await redis.zrem(key, member);
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTs = Number(oldest?.[1] ?? now);
    const retryAfterSec = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec, limit: rule.limit };
  }

  return { ok: true, remaining: Math.max(0, rule.limit - count), retryAfterSec: 0, limit: rule.limit };
}

/** Cabeceras estándar para una respuesta 429. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    'RateLimit-Limit': String(r.limit),
    'RateLimit-Remaining': String(r.remaining),
    ...(r.ok ? {} : { 'Retry-After': String(r.retryAfterSec) }),
  };
}
