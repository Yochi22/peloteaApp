import type { Prisma as PrismaNS } from '@pelotea/db';
import { calcularPrecio, calcularAbono, type ReglaPrecioInput } from '@pelotea/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export interface PrecioReservaResultado {
  duracionMin: number;
  fin: Date;
  /** Bs — lo que de verdad se transfiere por pago móvil. */
  total: number;
  montoServicio: number;
  montoAbono: number;
  montoRestante: number;
  /** Monto "real" del turno en la moneda que fija el club (USD/EUR/VES). */
  totalRef: number;
  monedaRef: string;
  /** Bs por unidad de `monedaRef`, congelada al momento de reservar. */
  tasaCambio: number;
  fechaTasa: Date;
  /** Inicio de cada unidad base — una fila de SlotLock por cada uno. */
  inicios: Date[];
}

export interface SedeConPoliticaAbono {
  precioMoneda: string;
  pagoParcialActivo: boolean;
  pagoParcialDuracionMinMin: number;
  pagoParcialHorasAdelanto: number;
}

export interface CanchaConDuracion {
  id: string;
  sedeId: string;
  duracionTurnoMin: number;
  duracionMaximaMin: number;
}

/**
 * Valida la duración pedida (múltiplo de la unidad base, dentro del máximo),
 * calcula el precio en la moneda que el club usa para fijar tarifas
 * (`Sede.precioMoneda` — muy común en Venezuela fijar en USD/EUR y cobrar en
 * Bs al cambio del día), lo convierte a Bs con la última tasa cargada, y
 * aplica la política de abono de la sede sobre el monto en Bs (que es lo
 * que de verdad se transfiere). Usado por `POST /api/reservas` y por el
 * auto-booking cuando un `PartidoAbierto` se llena — una sola fuente de
 * verdad para el dinero. Nunca confiar en un total que venga del cliente.
 *
 * La tasa se carga a mano en `/panel/tasa-cambio` — sin scraping ni API
 * automática (CLAUDE.md §5: el dinero en este proyecto es siempre manual).
 * Si el club no cargó ninguna tasa todavía, esto rechaza la reserva con
 * `sin_tasa_cambio` en vez de adivinar un número.
 */
export async function calcularPrecioReserva(
  tx: PrismaNS.TransactionClient,
  sede: SedeConPoliticaAbono,
  cancha: CanchaConDuracion,
  inicio: Date,
  duracionMinSolicitada: number | undefined,
  { esSplit }: { esSplit: boolean },
): Promise<PrecioReservaResultado> {
  const duracionMin = duracionMinSolicitada ?? cancha.duracionTurnoMin;
  if (
    duracionMin % cancha.duracionTurnoMin !== 0 ||
    duracionMin < cancha.duracionTurnoMin ||
    duracionMin > cancha.duracionMaximaMin
  ) {
    throw new HttpError(422, 'duracion_invalida');
  }
  const unidades = duracionMin / cancha.duracionTurnoMin;
  const fin = new Date(inicio.getTime() + duracionMin * 60_000);

  // Tasa de cambio: 1 si el club fija precios directo en Bs (sin conversión).
  let tasaCambio = 1;
  let fechaTasa = new Date();
  if (sede.precioMoneda !== 'VES') {
    const fila = await tx.tasaCambio.findFirst({
      where: { moneda: sede.precioMoneda, fecha: { lte: new Date() } },
      orderBy: { fecha: 'desc' },
    });
    if (!fila) throw new HttpError(409, 'sin_tasa_cambio');
    tasaCambio = Number(fila.tasaVES);
    fechaTasa = fila.fecha;
  }

  const reglas = await tx.reglaPrecio.findMany({
    where: { sedeId: cancha.sedeId, activa: true, OR: [{ canchaId: cancha.id }, { canchaId: null }] },
  });
  const reglasInput: ReglaPrecioInput[] = reglas.map((r) => ({
    diaSemana: r.diaSemana,
    horaDesde: r.horaDesde,
    horaHasta: r.horaHasta,
    tipoModificador: r.tipoModificador,
    valor: Number(r.valor),
    prioridad: r.prioridad,
    activa: r.activa,
  }));

  let totalRef = 0;
  let montoServicioRef = 0;
  const inicios: Date[] = [];
  for (let u = 0; u < unidades; u++) {
    const inicioUnidad = new Date(inicio.getTime() + u * cancha.duracionTurnoMin * 60_000);
    inicios.push(inicioUnidad);
    const diaSemana = inicioUnidad.getDay();
    const minutosDelDia = inicioUnidad.getHours() * 60 + inicioUnidad.getMinutes();

    const plantilla = await tx.plantillaHorario.findFirst({
      where: {
        canchaId: cancha.id,
        diaSemana,
        activa: true,
        horaInicio: { lte: minutosDelDia },
        horaFin: { gt: minutosDelDia },
      },
    });
    if (!plantilla) throw new HttpError(409, 'horario_no_disponible');

    // `precioBase` está en `Sede.precioMoneda` (USD/EUR) o directo en Bs si
    // la sede no convierte — calcularPrecio() no sabe ni le importa cuál.
    const r = calcularPrecio({
      precioBaseHora: Number(plantilla.precioBase),
      duracionMin: cancha.duracionTurnoMin,
      inicio: inicioUnidad,
      reglas: reglasInput,
    });
    totalRef += r.total;
    montoServicioRef += r.montoServicio;
  }
  totalRef = round2(totalRef);
  montoServicioRef = round2(montoServicioRef);

  const total = round2(totalRef * tasaCambio);
  const montoServicio = round2(montoServicioRef * tasaCambio);

  const { montoAbono, montoRestante } = esSplit
    ? { montoAbono: total, montoRestante: 0 }
    : calcularAbono(total, duracionMin, {
        activo: sede.pagoParcialActivo,
        duracionMinMin: sede.pagoParcialDuracionMinMin,
        horasAdelanto: sede.pagoParcialHorasAdelanto,
      });

  return {
    duracionMin,
    fin,
    total,
    montoServicio,
    montoAbono,
    montoRestante,
    totalRef,
    monedaRef: sede.precioMoneda,
    tasaCambio,
    fechaTasa,
    inicios,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
