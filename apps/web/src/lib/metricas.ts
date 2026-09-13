import { prisma } from '@pelotea/db';

export interface Metricas {
  rango: { desde: Date; hasta: Date };
  ingresosConfirmados: number;
  horasReservadas: number;
  horasDisponibles: number;
  ocupacionPct: number | null;
  noShows: number;
  tasaCancelacionPct: number;
  ticketPromedio: number;
  recuperadoOfertas: number;
  heatmap: Array<{ dia: number; hora: number; total: number }>;
}

/**
 * Horas que la sede publicó como reservables en `[desde, hasta)`, sumando
 * `PlantillaHorario` día por día y cancha por cancha, y restando los días
 * con una `ExcepcionHorario` de tipo CIERRE (feriado, cancha en
 * mantenimiento todo el día). Aproximación deliberada: un cierre PARCIAL
 * (unas horas, no el día completo) no se descuenta — recortarlo exacto pediría
 * cruzar rangos de horas, y la desviación es chica frente a lo simple que
 * queda así. Sirve para el % de ocupación del panel, no para facturación.
 */
async function calcularHorasDisponibles(sedeId: string, desde: Date, hasta: Date): Promise<number> {
  const [canchas, plantillas, cierres] = await Promise.all([
    prisma.cancha.findMany({ where: { sedeId, activa: true }, select: { id: true } }),
    prisma.plantillaHorario.findMany({ where: { sedeId, activa: true } }),
    prisma.excepcionHorario.findMany({
      where: { sedeId, tipo: 'CIERRE', fecha: { gte: desde, lt: hasta } },
      select: { canchaId: true, fecha: true },
    }),
  ]);
  if (canchas.length === 0 || plantillas.length === 0) return 0;

  const cierreClave = (canchaId: string | null, fecha: Date) => `${canchaId ?? 'sede'}:${fecha.toISOString().slice(0, 10)}`;
  const cierres_ = new Set(cierres.map((c) => cierreClave(c.canchaId, c.fecha)));

  let totalMin = 0;
  const cursor = new Date(desde);
  cursor.setHours(0, 0, 0, 0);
  while (cursor < hasta) {
    const diaSemana = cursor.getDay();
    const fechaClave = cursor.toISOString().slice(0, 10);
    for (const cancha of canchas) {
      const cerradaSede = cierres_.has(`sede:${fechaClave}`);
      const cerradaCancha = cierres_.has(`${cancha.id}:${fechaClave}`);
      if (cerradaSede || cerradaCancha) continue;
      for (const p of plantillas) {
        if (p.diaSemana !== diaSemana) continue;
        if (p.canchaId !== null && p.canchaId !== cancha.id) continue;
        totalMin += p.horaFin - p.horaInicio;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return totalMin / 60;
}

/**
 * Métricas del panel del dueño (CLAUDE.md §6). Compartido entre la página
 * `/panel` (SSR) y `/api/admin/metricas` (fetch desde el cliente si hace
 * falta refrescar sin recargar). El heatmap usa `$queryRaw` con TAGGED
 * TEMPLATE (parametrizado por Prisma) — nunca `$queryRawUnsafe`.
 */
export async function calcularMetricas(sedeId: string, desde: Date, hasta: Date): Promise<Metricas> {
  const confirmadas = await prisma.reserva.findMany({
    where: { sedeId, estado: { in: ['CONFIRMADA', 'COMPLETADA'] }, inicio: { gte: desde, lt: hasta } },
    select: { precioTotal: true, inicio: true, fin: true, ofertaId: true },
  });
  const noShows = await prisma.reserva.count({ where: { sedeId, estado: 'NO_SHOW', inicio: { gte: desde, lt: hasta } } });
  const canceladas = await prisma.reserva.count({ where: { sedeId, estado: 'CANCELADA', inicio: { gte: desde, lt: hasta } } });
  const totalReservas = confirmadas.length + noShows + canceladas;

  // Lo que ya se cobró NUNCA se devuelve — ni si cancela el cliente, ni si
  // no llega a jugar (no-show), sea que pagó solo el abono de la primera
  // hora o el 100% de una reserva de 2-3h. Antes esto solo se aplicaba a
  // CANCELADA; una reserva marcada NO_SHOW simplemente dejaba de ser
  // CONFIRMADA y desaparecía entera de "ingresos confirmados" — como si el
  // dinero se hubiera devuelto, cuando en realidad se quedó cobrado.
  // `confirmadaEn` distingue una CANCELADA que sí llegó a pagarse antes de
  // cancelarse (se cobró algo) de una cancelada en pendiente_pago (no se
  // había pagado nada) — un NO_SHOW siempre viene de una CONFIRMADA, así que
  // siempre tiene algo cobrado.
  // Se cuenta `montoAbono` (lo que de verdad se recibió), no `montoAbono +
  // montoRestante`: si un no-show tenía pago parcial, el resto se cobraría
  // EN PERSONA al llegar (`cobrar-restante`) — y si nunca llegó, ese resto
  // nunca se cobró. Sin pago parcial, `montoAbono` ya es el 100%.
  const retenidas = await prisma.reserva.findMany({
    where: {
      sedeId,
      inicio: { gte: desde, lt: hasta },
      OR: [
        { estado: 'CANCELADA', confirmadaEn: { not: null } },
        { estado: 'NO_SHOW' },
      ],
    },
    select: { montoAbono: true },
  });
  const ingresosRetenidos = retenidas.reduce((s, r) => s + Number(r.montoAbono), 0);

  const ingresosConfirmados = confirmadas.reduce((s, r) => s + Number(r.precioTotal), 0) + ingresosRetenidos;
  const horasReservadas = confirmadas.reduce((s, r) => s + (r.fin.getTime() - r.inicio.getTime()) / 3_600_000, 0);
  const ticketPromedio = confirmadas.length ? ingresosConfirmados / confirmadas.length : 0;

  const idsConOferta = confirmadas.filter((r) => r.ofertaId).map((r) => r.ofertaId as string);
  const ofertas = idsConOferta.length
    ? await prisma.oferta.findMany({ where: { id: { in: idsConOferta } }, select: { precioFinal: true, descuentoPct: true } })
    : [];
  const recuperadoOfertas = ofertas.reduce((s, o) => {
    const pct = o.descuentoPct ?? 0;
    if (pct >= 100) return s;
    const original = (Number(o.precioFinal) * 100) / (100 - pct);
    return s + (original - Number(o.precioFinal));
  }, 0);

  const heatmap = await prisma.$queryRaw<Array<{ dia: number; hora: number; total: bigint }>>`
    SELECT EXTRACT(DOW FROM inicio)::int AS dia, EXTRACT(HOUR FROM inicio)::int AS hora, COUNT(*)::bigint AS total
    FROM reserva
    WHERE "sedeId" = ${sedeId}
      AND estado IN ('CONFIRMADA', 'COMPLETADA')
      AND inicio >= ${desde} AND inicio < ${hasta}
    GROUP BY 1, 2
  `;

  const horasDisponibles = await calcularHorasDisponibles(sedeId, desde, hasta);

  return {
    rango: { desde, hasta },
    ingresosConfirmados: round2(ingresosConfirmados),
    horasReservadas: round2(horasReservadas),
    horasDisponibles: round2(horasDisponibles),
    ocupacionPct: horasDisponibles > 0 ? round2((horasReservadas / horasDisponibles) * 100) : null,
    noShows,
    tasaCancelacionPct: totalReservas ? round2((canceladas / totalReservas) * 100) : 0,
    ticketPromedio: round2(ticketPromedio),
    recuperadoOfertas: round2(recuperadoOfertas),
    heatmap: heatmap.map((h) => ({ dia: h.dia, hora: h.hora, total: Number(h.total) })),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
