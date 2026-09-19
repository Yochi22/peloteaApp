import Redis from 'ioredis';
import { prisma } from '@pelotea/db';

/** Mismo criterio que `apps/web/src/lib/sede.ts` — la sede activa del MVP single-tenant. */
export function sedeSlug(): string {
  return process.env.DEFAULT_SEDE_SLUG ?? 'club-piloto';
}

/** La primera cancha activa de la sede de pruebas (el seed crea "Cancha 1", pádel, abierta 06:00–23:00 todos los días). */
export async function canchaDePrueba(): Promise<{ id: string; duracionTurnoMin: number }> {
  const sede = await prisma.sede.findUniqueOrThrow({ where: { slug: sedeSlug() } });
  const cancha = await prisma.cancha.findFirstOrThrow({
    where: { sedeId: sede.id, activa: true, plantillas: { some: {} } },
    orderBy: { orden: 'asc' },
  });
  return { id: cancha.id, duracionTurnoMin: cancha.duracionTurnoMin };
}

/** Mañana a las 9am — siempre futuro, y el seed abre todas las canchas 06:00–23:00 todos los días. */
export function horarioValidoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

let contador = 0;
/** Un invitado distinto por llamada — evita chocar con el tope de no-shows/reservas repetidas entre pruebas. */
export function invitadoDePrueba(): { nombre: string; telefono: string } {
  contador += 1;
  const sufijo = String(Date.now()).slice(-6) + String(contador).padStart(2, '0');
  return { nombre: `Invitado Prueba ${contador}`, telefono: `0414-${sufijo.slice(0, 3)}-${sufijo.slice(3)}` };
}

/**
 * Vacía el cupo de rate-limit de un preset — sin esto, correr la suite dos
 * veces en la misma hora (mismo Redis) hace que las pruebas que SÍ deben
 * pasar (comportamiento normal) empiecen a fallar con 429 por cupo ya
 * gastado de una corrida anterior.
 */
export async function limpiarRateLimit(preset: string): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  try {
    const claves = await redis.keys(`rl:${preset}:*`);
    if (claves.length > 0) await redis.del(...claves);
  } finally {
    await redis.quit();
  }
}
