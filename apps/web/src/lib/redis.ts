import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    // Conectar recién al primer comando, no al importar el módulo — así
    // `next build` (que evalúa las rutas para generar metadata) no intenta
    // hablarle a un Redis que puede no estar levantado en build-time.
    lazyConnect: true,
  });

redis.on('error', (err) => {
  // ioredis reintenta solo; logueamos sin tirar el proceso.
  console.error('[redis] error de conexión:', err.message);
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
