export type Periodo = 'hoy' | 'semana' | 'mes';

export const PERIODO_LABEL: Record<Periodo, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
};

/**
 * Rango [desde, hasta] para cada preset — usado por /panel y /panel/finanzas
 * para que las estadísticas "se reinicien" cada día en vez de arrastrar
 * siempre los últimos 30 días. `hasta` es el fin del día de HOY (no el
 * instante actual): una reserva ya CONFIRMADA para más tarde hoy debe
 * seguir contando (mismo criterio que el fix de "ingresos confirmados").
 */
export function calcularRangoPeriodo(periodo: Periodo, ahora = new Date()): { desde: Date; hasta: Date } {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const hasta = new Date(ahora);
  hasta.setHours(23, 59, 59, 999);

  if (periodo === 'hoy') return { desde: hoy, hasta };

  if (periodo === 'semana') {
    const dia = hoy.getDay(); // 0 = domingo
    const diasDesdeElLunes = dia === 0 ? 6 : dia - 1;
    const desde = new Date(hoy);
    desde.setDate(hoy.getDate() - diasDesdeElLunes);
    return { desde, hasta };
  }

  // mes
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde, hasta };
}
