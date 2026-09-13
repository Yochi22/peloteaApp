export * from './headers';
export * from './rate-limit';
export * as idempotency from './idempotency';
export * from './csrf';
export * from './upload-guard';
export * from './password';
export * from './session';

/**
 * REGLA DURA — SQL injection:
 * Prisma parametriza por defecto. Está PROHIBIDO construir SQL con concatenación
 * o interpolación de strings. Si hace falta SQL crudo, usar SIEMPRE la forma de
 * tagged template de Prisma, que parametriza:
 *
 *   ✅ prisma.$queryRaw`SELECT * FROM reserva WHERE id = ${id}`
 *   ❌ prisma.$queryRawUnsafe(`SELECT * FROM reserva WHERE id = '${id}'`)
 *
 * `$queryRawUnsafe` / `$executeRawUnsafe` están bloqueados por ESLint
 * (no-restricted-syntax) — ver .eslintrc del monorepo.
 */
export const SQL_SAFETY_NOTE = 'Usar solo tagged templates de Prisma. Nunca *Unsafe ni concatenación.';
