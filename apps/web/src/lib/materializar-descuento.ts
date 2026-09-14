import { prisma } from '@pelotea/db';
import { calcularPrecio, type ReglaPrecioInput } from '@pelotea/shared';

const HORIZONTE_DIAS = 14;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Misma lógica que `apps/worker/src/jobs/materializar-descuentos.ts`, pero
 * para UNA sola regla recién creada/reactivada — se llama al toque desde
 * `POST /api/admin/descuentos` para que el admin vea el descuento
 * reflejado de inmediato al probarlo como cliente, sin esperar el próximo
 * barrido del worker (cada 30 min, y en Render free tier puede estar
 * dormido — ver RENDER.md). El worker sigue corriendo igual para mantener
 * el horizonte de 14 días al día y agarrar reactivaciones.
 */
export async function materializarReglaAhora(reglaId: string): Promise<void> {
  const regla = await prisma.reglaDescuento.findUnique({ where: { id: reglaId }, include: { cancha: true } });
  if (!regla || !regla.activa) return;
  const cancha = regla.cancha;
  if (!cancha.activa) return;

  const ahora = new Date();
  const [sede, reglasPrecio] = await Promise.all([
    prisma.sede.findUniqueOrThrow({ where: { id: regla.sedeId } }),
    prisma.reglaPrecio.findMany({
      where: { sedeId: regla.sedeId, activa: true, OR: [{ canchaId: cancha.id }, { canchaId: null }] },
    }),
  ]);
  const reglasInput: ReglaPrecioInput[] = reglasPrecio.map((r) => ({
    diaSemana: r.diaSemana,
    horaDesde: r.horaDesde,
    horaHasta: r.horaHasta,
    tipoModificador: r.tipoModificador,
    valor: Number(r.valor),
    prioridad: r.prioridad,
    activa: r.activa,
  }));

  let tasaVES = 1;
  if (sede.precioMoneda !== 'VES') {
    const tasa = await prisma.tasaCambio.findFirst({
      where: { moneda: sede.precioMoneda, fecha: { lte: ahora } },
      orderBy: { fecha: 'desc' },
    });
    if (!tasa) return; // sin tasa cargada: no se puede cobrar bien, se deja para cuando la carguen
    tasaVES = Number(tasa.tasaVES);
  }

  for (let d = 0; d < HORIZONTE_DIAS; d++) {
    const dia = new Date(ahora);
    dia.setDate(dia.getDate() + d);
    dia.setHours(0, 0, 0, 0);
    const diaSemana = dia.getDay();
    if (regla.diaSemana !== null && regla.diaSemana !== diaSemana) continue;

    const plantillasDia = await prisma.plantillaHorario.findMany({ where: { canchaId: cancha.id, diaSemana, activa: true } });

    for (let min = regla.horaInicio; min + cancha.duracionTurnoMin <= regla.horaFin; min += cancha.duracionTurnoMin) {
      const inicioObjetivo = new Date(dia.getTime() + min * 60_000);
      if (inicioObjetivo <= ahora) continue;

      const plantilla = plantillasDia.find((p) => p.horaInicio <= min && p.horaFin > min);
      if (!plantilla) continue;

      const yaExiste = await prisma.oferta.findUnique({
        where: { reglaId_inicioObjetivo: { reglaId: regla.id, inicioObjetivo } },
        select: { id: true },
      });
      if (yaExiste) continue;

      const { total } = calcularPrecio({
        precioBaseHora: Number(plantilla.precioBase),
        duracionMin: cancha.duracionTurnoMin,
        inicio: inicioObjetivo,
        reglas: reglasInput,
      });
      const precioBs = round2(total * tasaVES);
      const precioFinal = round2(precioBs * (1 - regla.descuentoPct / 100));
      const finObjetivo = new Date(inicioObjetivo.getTime() + cancha.duracionTurnoMin * 60_000);

      await prisma.oferta.create({
        data: {
          sedeId: regla.sedeId,
          canchaId: cancha.id,
          tipo: 'EXPRES',
          inicioObjetivo,
          finObjetivo,
          descuentoPct: regla.descuentoPct,
          precioFinal,
          ventanaInicio: ahora,
          ventanaFin: inicioObjetivo,
          cupo: 1,
          reglaId: regla.id,
          filtros: { soloOptIn: true },
        },
      });
    }
  }
}
