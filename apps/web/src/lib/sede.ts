import { prisma, type Sede } from '@pelotea/db';

/**
 * MVP single-tenant: hay una sola sede activa, definida por DEFAULT_SEDE_SLUG.
 * Cuando se generalice a multi-complejo, esto se resuelve por subdominio/slug de
 * la URL y el resto del código no cambia (ya todo filtra por sedeId).
 */

let cache: Sede | null = null;

export async function getSedeActiva(): Promise<Sede> {
  if (cache) return cache;
  const slug = process.env.DEFAULT_SEDE_SLUG ?? 'club-piloto';
  const sede = await prisma.sede.findUnique({ where: { slug } });
  if (!sede) throw new Error(`No existe la sede "${slug}". Corré el seed.`);
  cache = sede;
  return sede;
}

/** Invalida el caché en memoria — llamar tras cualquier UPDATE a la Sede activa. */
export function invalidarSedeActiva(): void {
  cache = null;
}
