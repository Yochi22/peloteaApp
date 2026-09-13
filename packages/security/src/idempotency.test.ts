import { describe, it, expect, beforeEach } from 'vitest';
// @ts-expect-error — sin tipos propios, pero implementa la misma API que ioredis para lo que usamos.
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { begin, complete, abort, isValidIdempotencyKey } from './idempotency';

/**
 * Cubre el caso real que motivó este mecanismo: reenvío de formulario / doble
 * click / retry de red con la misma `Idempotency-Key`. Sin Redis real
 * disponible en este entorno, `ioredis-mock` ejecuta el mismo SET NX / GET
 * que un Redis de verdad.
 */

let redis: Redis;
const CLAVE = 'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6';

beforeEach(() => {
  redis = new RedisMock();
});

describe('isValidIdempotencyKey', () => {
  it('acepta un UUID v4 típico', () => {
    expect(isValidIdempotencyKey(CLAVE)).toBe(true);
  });
  it('rechaza vacío, null o demasiado corto', () => {
    expect(isValidIdempotencyKey(null)).toBe(false);
    expect(isValidIdempotencyKey(undefined)).toBe(false);
    expect(isValidIdempotencyKey('corto')).toBe(false);
  });
  it('rechaza caracteres fuera del set permitido (inyección/control chars)', () => {
    expect(isValidIdempotencyKey('a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6; DROP TABLE')).toBe(false);
  });
});

describe('begin/complete/abort', () => {
  it('la primera vez con una clave nueva devuelve null (seguir con la operación)', async () => {
    const hit = await begin(redis, 'crear-reserva', CLAVE);
    expect(hit).toBeNull();
  });

  it('una segunda request concurrente con la misma clave ve "in_progress"', async () => {
    await begin(redis, 'crear-reserva', CLAVE);
    const segunda = await begin(redis, 'crear-reserva', CLAVE);
    expect(segunda?.status).toBe('in_progress');
  });

  it('tras completar, un reenvío con la misma clave recibe la respuesta guardada (no repite el efecto)', async () => {
    await begin(redis, 'crear-reserva', CLAVE);
    await complete(redis, 'crear-reserva', CLAVE, { reservaId: 'r1' });

    const reenvio = await begin<{ reservaId: string }>(redis, 'crear-reserva', CLAVE);
    expect(reenvio?.status).toBe('completed');
    expect(reenvio?.response).toEqual({ reservaId: 'r1' });
  });

  it('distintos scopes con la misma clave no se pisan entre sí', async () => {
    await begin(redis, 'crear-reserva', CLAVE);
    const otroScope = await begin(redis, 'unirse-partido', CLAVE);
    expect(otroScope).toBeNull();
  });

  it('abort libera la clave para permitir un reintento legítimo tras un fallo', async () => {
    await begin(redis, 'crear-reserva', CLAVE);
    await abort(redis, 'crear-reserva', CLAVE);

    const reintento = await begin(redis, 'crear-reserva', CLAVE);
    expect(reintento).toBeNull();
  });
});
