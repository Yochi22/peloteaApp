import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma único (evita agotar conexiones en dev con HMR).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';

/**
 * Modelos que SIEMPRE deben filtrarse por sede. Toda query de negocio pasa por
 * acá — nunca consultar estos modelos sin `sedeId`. Ver CLAUDE.md §5.
 */
export const MODELOS_CON_SEDE = [
  'Cancha',
  'PlantillaHorario',
  'ExcepcionHorario',
  'ReglaPrecio',
  'Reserva',
  'SlotLock',
  'Pago',
  'Oferta',
  'PartidoAbierto',
] as const;

/**
 * Devuelve un cliente "scoped" a una sede: inyecta `where.sedeId` en las lecturas
 * y `data.sedeId` en las escrituras de los modelos de negocio. Es una red de
 * seguridad, no un reemplazo de los checks de rol en cada handler.
 */
export function prismaParaSede(sedeId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !MODELOS_CON_SEDE.includes(model as never)) {
            return query(args);
          }
          const a = args as Record<string, unknown>;

          if (
            operation === 'findMany' ||
            operation === 'findFirst' ||
            operation === 'findUnique' ||
            operation === 'count' ||
            operation === 'aggregate' ||
            operation === 'updateMany' ||
            operation === 'deleteMany'
          ) {
            a.where = { ...(a.where as object), sedeId };
          }

          if (operation === 'create') {
            a.data = { ...(a.data as object), sedeId };
          }
          if (operation === 'createMany' && Array.isArray((a.data as unknown[]))) {
            a.data = (a.data as Record<string, unknown>[]).map((d) => ({ ...d, sedeId }));
          }

          return query(a);
        },
      },
    },
  });
}

export type PrismaScoped = ReturnType<typeof prismaParaSede>;
// `Prisma` (namespace, Decimal, errores como PrismaClientKnownRequestError)
// ya sale de `export * from '@prisma/client'` arriba — no reexportar de nuevo
// (rompe con "Duplicate export 'Prisma'").
