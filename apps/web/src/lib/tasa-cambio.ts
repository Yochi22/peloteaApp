import { prisma } from '@pelotea/db';

export interface TasaVigente {
  tasaVES: number;
  fecha: Date;
  moneda: string;
}

/**
 * Última tasa cargada para `moneda` con fecha <= hoy (BCV no publica fin de
 * semana/feriado, así que "la de hoy" normalmente es la del último día
 * hábil — se muestra la fecha siempre para que quede claro). Entrada
 * MANUAL, sin scraping: ver `/panel/tasa-cambio` y CLAUDE.md §5.
 */
export async function obtenerTasaVigente(moneda: string): Promise<TasaVigente | null> {
  if (moneda === 'VES') return { tasaVES: 1, fecha: new Date(), moneda: 'VES' };

  const fila = await prisma.tasaCambio.findFirst({
    where: { moneda, fecha: { lte: new Date() } },
    orderBy: { fecha: 'desc' },
  });
  if (!fila) return null;
  return { tasaVES: Number(fila.tasaVES), fecha: fila.fecha, moneda };
}

/** ¿La tasa vigente es de hoy o de ayer, o está más vieja (staff se olvidó de actualizarla)? */
export function antiguedadTasaDias(fecha: Date): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = new Date(fecha);
  dia.setHours(0, 0, 0, 0);
  return Math.round((hoy.getTime() - dia.getTime()) / 86_400_000);
}
