import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';

/** Cuántos días de historial de TasaCambio se conservan. */
const RETENCION_DIAS = 7;

/**
 * `TasaCambio` es una fila por día (BCV, cargada a mano) — no hace falta
 * guardarla para siempre, ninguna reserva depende de tasas viejas (cada
 * `Reserva.tasaCambio` ya congela el número que usó, no una referencia a
 * esta tabla). Un barrido diario alcanza de sobra.
 *
 * OJO: nunca borra la fila más reciente de cada moneda, aunque ya tenga más
 * de `RETENCION_DIAS` — `obtenerTasaVigente()` la necesita para poder
 * cobrar mientras nadie cargue una más nueva; sin esta excepción, un club
 * que se atrasa en cargar la tasa se quedaría sin ninguna y nadie podría
 * reservar con pago en línea.
 */
export async function procesarLimpiezaTasaCambio(_job: Job): Promise<void> {
  const limite = new Date(Date.now() - RETENCION_DIAS * 24 * 60 * 60_000);
  const monedas = await prisma.tasaCambio.findMany({ distinct: ['moneda'], select: { moneda: true } });

  for (const { moneda } of monedas) {
    const vigente = await prisma.tasaCambio.findFirst({ where: { moneda }, orderBy: { fecha: 'desc' } });
    if (!vigente) continue;
    await prisma.tasaCambio.deleteMany({ where: { moneda, fecha: { lt: limite }, id: { not: vigente.id } } });
  }
}
