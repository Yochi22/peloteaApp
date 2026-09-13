/**
 * Punto de entrada EDGE-SAFE: solo utilidades sin dependencias de Node
 * (nada de argon2 ni ioredis). Lo que puede usar `apps/web/middleware.ts`.
 */
export * from './headers';
export * from './csrf';
