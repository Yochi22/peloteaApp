import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { calcularPrecio, type ReglaPrecioInput } from '@pelotea/shared';

/** Cuántos días hacia adelante se materializan ofertas EXPRES desde las reglas activas. */
const HORIZONTE_DIAS = 14;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * NUNCA genera descuentos por su cuenta — solo convierte en filas de
 * `Oferta` reales (para que las vea el cliente y las despache
 * `oferta-dispatch`) las reglas que un admin programó a mano en
 * `/panel/descuentos` (cancha, día de semana, horario, %). Si el admin
 * desactiva o borra una regla, las ofertas ya materializadas pero sin tomar
 * se cancelan (ver `/api/admin/descuentos/[id]`) — esto solo AGREGA filas
 * nuevas para los próximos `HORIZONTE_DIAS` días, nunca las borra.
 *
 * Idempotente por `@@unique([reglaId, inicioObjetivo])`: correr esto de
 * nuevo sobre el mismo rango no duplica nada, así que un barrido periódico
 * (ver index.ts) alcanza sin necesidad de trackear qué días ya se hicieron.
 */
export async function procesarMaterializarDescuentos(_job: Job): Promise<void> {
  const ahora = new Date();
  const reglas = await prisma.reglaDescuento.findMany({ where: { activa: true }, include: { cancha: true } });

  for (const regla of reglas) {
    const cancha = regla.cancha;
    if (!cancha.activa) continue;

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

    // Si el club fija precios en USD/EUR, hace falta la tasa del día para
    // convertir a Bs (Oferta.precioFinal SIEMPRE es Bs, igual que
    // Reserva.precioTotal) — mismo criterio que disponibilidad.ts, sin
    // scraping ni API automática (CLAUDE.md §5).
    let tasaVES = 1;
    if (sede.precioMoneda !== 'VES') {
      const tasa = await prisma.tasaCambio.findFirst({
        where: { moneda: sede.precioMoneda, fecha: { lte: ahora } },
        orderBy: { fecha: 'desc' },
      });
      if (!tasa) continue; // sin tasa cargada: no se puede cobrar bien, se salta esta regla por ahora
      tasaVES = Number(tasa.tasaVES);
    }

    for (let d = 0; d < HORIZONTE_DIAS; d++) {
      const dia = new Date(ahora);
      dia.setDate(dia.getDate() + d);
      dia.setHours(0, 0, 0, 0);
      const diaSemana = dia.getDay();
      if (regla.diaSemana !== null && regla.diaSemana !== diaSemana) continue;

      const plantillasDia = await prisma.plantillaHorario.findMany({
        where: { canchaId: cancha.id, diaSemana, activa: true },
      });

      for (let min = regla.horaInicio; min + cancha.duracionTurnoMin <= regla.horaFin; min += cancha.duracionTurnoMin) {
        const inicioObjetivo = new Date(dia.getTime() + min * 60_000);
        if (inicioObjetivo <= ahora) continue; // no ofertar horas que ya pasaron

        // Solo si de verdad cae dentro de un horario operativo publicado —
        // una regla no puede inventar disponibilidad fuera de PlantillaHorario.
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
}
