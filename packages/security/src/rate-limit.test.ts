import { describe, it, expect, beforeEach } from 'vitest';
// @ts-expect-error — sin tipos propios, pero implementa la misma API que ioredis para lo que usamos.
import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { rateLimit } from './rate-limit';

/**
 * `ioredis-mock` implementa multi()/zadd/zrem/etc en memoria — así probamos la
 * ventana deslizante de verdad (sin mockear `rateLimit` mismo) sin necesitar un
 * Redis real. Antes esta lógica no tenía ningún test.
 *
 * OJO: `ioredis-mock` simula conectarse al mismo servidor entre instancias —
 * el almacenamiento se comparte incluso con un `new RedisMock()` por test. Por
 * eso cada test usa su propia key (nunca reutiliza 'k' entre tests), igual que
 * en Redis real distintos endpoints/IPs nunca comparten key.
 */

let redis: Redis;

beforeEach(() => {
  redis = new RedisMock();
});

describe('rateLimit', () => {
  it('permite solicitudes hasta el límite', async () => {
    const rule = { limit: 3, windowSec: 60 };
    for (let i = 0; i < 3; i++) {
      const r = await rateLimit(redis, 'permite', rule);
      expect(r.ok).toBe(true);
    }
  });

  it('rechaza al superar el límite dentro de la ventana', async () => {
    const rule = { limit: 3, windowSec: 60 };
    for (let i = 0; i < 3; i++) await rateLimit(redis, 'rechaza', rule);
    const r = await rateLimit(redis, 'rechaza', rule);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it('una solicitud rechazada no cuenta contra el propio límite (se puede reintentar)', async () => {
    const rule = { limit: 1, windowSec: 60 };
    await rateLimit(redis, 'no-contamina', rule); // ok
    await rateLimit(redis, 'no-contamina', rule); // rechazada
    await rateLimit(redis, 'no-contamina', rule); // rechazada otra vez
    const r = await rateLimit(redis, 'no-contamina-otra-key', rule);
    expect(r.ok).toBe(true); // otra key, sin contaminarse por los rechazos anteriores
  });

  it('libera cupo una vez que la ventana pasó', async () => {
    const rule = { limit: 1, windowSec: 60 };
    const t0 = 1_000_000;
    await rateLimit(redis, 'libera-cupo', rule, t0);
    const rechazada = await rateLimit(redis, 'libera-cupo', rule, t0 + 1000);
    expect(rechazada.ok).toBe(false);

    const despuesDeLaVentana = await rateLimit(redis, 'libera-cupo', rule, t0 + 61_000);
    expect(despuesDeLaVentana.ok).toBe(true);
  });

  it('mantiene ventanas independientes por key (IP/identificador distinto)', async () => {
    const rule = { limit: 1, windowSec: 60 };
    await rateLimit(redis, 'independiente-a', rule);
    const otraIp = await rateLimit(redis, 'independiente-b', rule);
    expect(otraIp.ok).toBe(true);
  });
});
