import type Redis from 'ioredis';

/**
 * Idempotencia para operaciones sensibles a doble envío: crear reserva, enviar
 * comprobante, unirse a partido, cubrir una cuota. El cliente manda un header
 * `Idempotency-Key` (UUID); el servidor guarda el resultado y lo re-sirve si la
 * misma clave llega otra vez (reenvío de formulario, doble click, retry de red).
 */

const PREFIX = 'idem:';
const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24 h

export interface IdempotencyHit<T = unknown> {
  status: 'completed' | 'in_progress';
  response?: T;
}

/** Valida el formato de la clave (UUID v4 recomendado, aceptamos 16-128 hex/uuid). */
export function isValidIdempotencyKey(key: string | null | undefined): key is string {
  return !!key && /^[A-Za-z0-9_-]{16,128}$/.test(key);
}

/**
 * Reserva la clave. Devuelve:
 *  - null           → primera vez, seguí con la operación y luego llamá `complete`
 *  - {in_progress}  → otra request con la misma clave está corriendo (responder 409)
 *  - {completed,response} → ya se resolvió; devolver la respuesta guardada
 */
export async function begin<T>(
  redis: Redis,
  scope: string,
  key: string,
  ttlSec = DEFAULT_TTL_SEC,
): Promise<IdempotencyHit<T> | null> {
  const k = `${PREFIX}${scope}:${key}`;
  const created = await redis.set(k, JSON.stringify({ status: 'in_progress' }), 'EX', ttlSec, 'NX');
  if (created === 'OK') return null;

  const raw = await redis.get(k);
  if (!raw) return null; // expiró entre el SET NX y el GET: tratar como primera vez
  return JSON.parse(raw) as IdempotencyHit<T>;
}

/** Guarda la respuesta final para futuros reintentos con la misma clave. */
export async function complete<T>(
  redis: Redis,
  scope: string,
  key: string,
  response: T,
  ttlSec = DEFAULT_TTL_SEC,
): Promise<void> {
  const k = `${PREFIX}${scope}:${key}`;
  await redis.set(k, JSON.stringify({ status: 'completed', response }), 'EX', ttlSec);
}

/** Libera la clave si la operación falló, para permitir un reintento legítimo. */
export async function abort(redis: Redis, scope: string, key: string): Promise<void> {
  await redis.del(`${PREFIX}${scope}:${key}`);
}
