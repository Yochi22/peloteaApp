import { prisma, type Sede } from '@pelotea/db';

/**
 * MVP single-tenant: hay una sola sede activa, definida por DEFAULT_SEDE_SLUG.
 * Cuando se generalice a multi-complejo, esto se resuelve por subdominio/slug de
 * la URL y el resto del código no cambia (ya todo filtra por sedeId).
 */

let cache: Sede | null = null;

export async function getSedeActiva(): Promise<Sede> {
  if (cache) return cache;
  const sede = await getSedeActivaONull();
  if (!sede) {
    throw new Error(
      `No existe la sede "${process.env.DEFAULT_SEDE_SLUG ?? 'club-piloto'}" todavía — falta pasar por /configurar (o correr el seed).`,
    );
  }
  cache = sede;
  return sede;
}

/**
 * Igual que `getSedeActiva()` pero sin lanzar si todavía no existe — para
 * páginas públicas que deben poder mostrar un estado vacío en vez de
 * reventar (p.ej. `/canchas` recién desplegado, antes de pasar por
 * `/configurar`).
 */
export async function getSedeActivaONull(): Promise<Sede | null> {
  if (cache) return cache;
  const slug = process.env.DEFAULT_SEDE_SLUG ?? 'club-piloto';
  const sede = await prisma.sede.findUnique({ where: { slug } });
  if (sede) cache = sede;
  return sede;
}

/** Invalida el caché en memoria — llamar tras cualquier UPDATE a la Sede activa. */
export function invalidarSedeActiva(): void {
  cache = null;
}
