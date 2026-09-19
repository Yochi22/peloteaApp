import { prisma } from '@pelotea/db';
import { calcularPrecio, type ReglaPrecioInput } from '@pelotea/shared';
import { obtenerTasaVigente } from './tasa-cambio';

export interface SlotDisponible {
  inicioISO: string;
  finISO: string;
  /** Precio de UNA unidad base (Cancha.duracionTurnoMin) empezando acá, en Bs. */
  precio: number;
  /** El mismo precio, en la moneda que fija el club (`monedaRef` de la respuesta). Null si no hay tasa cargada. */
  precioRef: number | null;
  estado: 'libre' | 'ocupado' | 'oferta' | 'revision';
  ofertaId?: string;
  descuentoPct?: number;
  /** Cuántas de las `Cancha.cantidad` unidades siguen libres a esta hora. */
  cuposLibres: number;
  /**
   * Cuántas unidades base consecutivas y libres hay a partir de este slot
   * (incluyéndolo), tope `duracionMaximaMin / duracionTurnoMin`. Con esto la
   * UI ofrece "1h / 2h / 3h…" solo hasta donde de verdad hay hueco — nunca
   * deja elegir una duración que pisaría un turno ocupado. Solo > 1 en
   * slots 'libre' (una oferta o un turno en revisión son de una sola unidad).
   */
  unidadesConsecutivas: number;
}

export interface Disponibilidad {
  slots: SlotDisponible[];
  /** Moneda en la que el club fija tarifas (Sede.precioMoneda). */
  monedaRef: string;
  /** Bs por unidad de `monedaRef`. Null si el club no cargó ninguna tasa todavía. */
  tasaCambio: number | null;
  fechaTasa: string | null;
}

/**
 * Genera los turnos de una cancha para los próximos `dias` días a partir de su
 * `PlantillaHorario`, marcando ocupados (SlotLock vigente) y ofertas activas.
 * Cálculo de precio en el servidor — nunca confiar en un precio que venga del
 * cliente. Si el club fija precios en USD/EUR, convierte a Bs con la última
 * tasa cargada a mano (ver `@/lib/tasa-cambio` — nada de scraping/API).
 */
export async function slotsDisponibles(canchaId: string, dias = 7): Promise<Disponibilidad> {
  const cancha = await prisma.cancha.findUniqueOrThrow({ where: { id: canchaId }, include: { sede: true } });
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + dias);
  const [plantillas, reglas, locks, ofertas, tasa, excepciones] = await Promise.all([
    prisma.plantillaHorario.findMany({ where: { canchaId, activa: true } }),
    prisma.reglaPrecio.findMany({ where: { sedeId: cancha.sedeId, activa: true, OR: [{ canchaId }, { canchaId: null }] } }),
    prisma.slotLock.findMany({ where: { canchaId, expiraEn: { gt: new Date() } } }),
    prisma.oferta.findMany({ where: { canchaId, estado: 'ACTIVA', ventanaFin: { gt: new Date() } } }),
    obtenerTasaVigente(cancha.sede.precioMoneda),
    prisma.excepcionHorario.findMany({
      where: { sedeId: cancha.sedeId, OR: [{ canchaId }, { canchaId: null }], fecha: { gte: desde, lt: hasta } },
    }),
  ]);
  // Un día bloqueado por completo (sin horaInicio/horaFin) → clave "YYYY-MM-DD".
  const diasBloqueados = new Set(
    excepciones.filter((e) => e.horaInicio == null).map((e) => e.fecha.toISOString().slice(0, 10)),
  );
  // Franjas puntuales bloqueadas dentro de un día que sigue abierto el resto del día.
  const franjasBloqueadas = excepciones
    .filter((e) => e.horaInicio != null)
    .map((e) => ({ fecha: e.fecha.toISOString().slice(0, 10), horaInicio: e.horaInicio!, horaFin: e.horaFin! }));

  const reglasInput: ReglaPrecioInput[] = reglas.map((r) => ({
    diaSemana: r.diaSemana,
    horaDesde: r.horaDesde,
    horaHasta: r.horaHasta,
    tipoModificador: r.tipoModificador,
    valor: Number(r.valor),
    prioridad: r.prioridad,
    activa: r.activa,
  }));

  // Cuántos `unidad` de SlotLock hay tomados por horario — con
  // `cantidad` canchas idénticas de este tipo, un horario solo está
  // "ocupado" cuando TODAS las unidades están tomadas, no con una sola.
  const tomadosPorInicio = new Map<number, number>();
  for (const l of locks) {
    tomadosPorInicio.set(l.inicio.getTime(), (tomadosPorInicio.get(l.inicio.getTime()) ?? 0) + 1);
  }
  const ofertaPorInicio = new Map(ofertas.filter((o) => o.tomada < o.cupo).map((o) => [o.inicioObjetivo.getTime(), o]));

  const slots: SlotDisponible[] = [];
  const ahora = new Date();

  for (let d = 0; d < dias; d++) {
    const dia = new Date(ahora);
    dia.setDate(dia.getDate() + d);
    dia.setHours(0, 0, 0, 0);
    const diaSemana = dia.getDay();
    const claveDia = dia.toISOString().slice(0, 10);
    if (diasBloqueados.has(claveDia)) continue; // feriado/cierre de todo el día

    for (const plantilla of plantillas.filter((p) => p.diaSemana === diaSemana)) {
      for (let min = plantilla.horaInicio; min + cancha.duracionTurnoMin <= plantilla.horaFin; min += cancha.duracionTurnoMin) {
        const inicio = new Date(dia);
        inicio.setMinutes(min);
        if (inicio.getTime() <= ahora.getTime()) continue; // no ofrecer horas pasadas
        if (franjasBloqueadas.some((f) => f.fecha === claveDia && min < f.horaFin && min + cancha.duracionTurnoMin > f.horaInicio)) {
          continue; // mantenimiento/torneo puntual ese día
        }

        const fin = new Date(inicio.getTime() + cancha.duracionTurnoMin * 60_000);
        const { total } = calcularPrecio({
          precioBaseHora: Number(plantilla.precioBase),
          duracionMin: cancha.duracionTurnoMin,
          inicio,
          reglas: reglasInput,
        });

        const oferta = ofertaPorInicio.get(inicio.getTime());
        let estado: SlotDisponible['estado'] = 'libre';
        // `oferta.precioFinal` ya está en Bs (se fija al cancelarse la reserva
        // original) — para el resto, `total` está en `monedaRef` y hay que
        // convertirlo.
        let precioRef: number | null = total;
        let precioBs = tasa ? round2(total * tasa.tasaVES) : NaN;
        const tomados = tomadosPorInicio.get(inicio.getTime()) ?? 0;
        const cuposLibres = Math.max(0, cancha.cantidad - tomados);
        if (cuposLibres <= 0) {
          estado = 'ocupado';
        } else if (oferta) {
          estado = 'oferta';
          precioBs = Number(oferta.precioFinal);
          precioRef = tasa ? round2(precioBs / tasa.tasaVES) : null;
        }

        slots.push({
          inicioISO: inicio.toISOString(),
          finISO: fin.toISOString(),
          precio: precioBs,
          precioRef,
          estado,
          ofertaId: oferta?.id,
          descuentoPct: oferta?.descuentoPct ?? undefined,
          unidadesConsecutivas: 1,
          cuposLibres,
        });
      }
    }
  }

  slots.sort((a, b) => a.inicioISO.localeCompare(b.inicioISO));

  const maxUnidades = Math.max(1, Math.floor(cancha.duracionMaximaMin / cancha.duracionTurnoMin));
  const porInicio = new Map(slots.map((s) => [s.inicioISO, s]));
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (s.estado !== 'libre') continue;
    let cuenta = 1;
    let cursorFin = s.finISO;
    while (cuenta < maxUnidades) {
      const siguiente = porInicio.get(cursorFin);
      if (!siguiente || siguiente.estado !== 'libre') break;
      cuenta++;
      cursorFin = siguiente.finISO;
    }
    s.unidadesConsecutivas = cuenta;
  }

  return {
    slots,
    monedaRef: cancha.sede.precioMoneda,
    tasaCambio: tasa?.tasaVES ?? null,
    fechaTasa: tasa?.fecha.toISOString() ?? null,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
