/** Cálculo de precio de un turno. Puro y testeable. */

export interface ReglaPrecioInput {
  diaSemana: number | null;
  horaDesde: number | null; // minutos desde medianoche
  horaHasta: number | null;
  tipoModificador: 'PORCENTAJE' | 'MONTO_FIJO';
  valor: number;
  prioridad: number;
  activa: boolean;
}

export interface CalculoPrecioInput {
  precioBaseHora: number;
  duracionMin: number;
  inicio: Date; // en hora local de la sede (ya convertida)
  reglas: ReglaPrecioInput[];
  /** Descuento explícito de una oferta (porcentaje 0-100). */
  descuentoOfertaPct?: number;
  /** Cargo por servicio de la plataforma. */
  montoServicio?: number;
}

export interface CalculoPrecioResultado {
  precioBase: number;
  ajustes: Array<{ nombre: string; delta: number }>;
  subtotal: number;
  montoServicio: number;
  total: number;
}

function minutosDelDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function calcularPrecio(input: CalculoPrecioInput): CalculoPrecioResultado {
  const {
    precioBaseHora,
    duracionMin,
    inicio,
    reglas,
    descuentoOfertaPct = 0,
    montoServicio = 0,
  } = input;

  const precioBase = round2((precioBaseHora * duracionMin) / 60);
  const dia = inicio.getDay();
  const min = minutosDelDia(inicio);

  const aplicables = reglas
    .filter((r) => r.activa)
    .filter((r) => r.diaSemana == null || r.diaSemana === dia)
    .filter((r) => r.horaDesde == null || min >= r.horaDesde)
    .filter((r) => r.horaHasta == null || min < r.horaHasta)
    .sort((a, b) => b.prioridad - a.prioridad);

  const ajustes: Array<{ nombre: string; delta: number }> = [];
  let subtotal = precioBase;

  for (const r of aplicables) {
    const delta =
      r.tipoModificador === 'PORCENTAJE' ? round2((subtotal * r.valor) / 100) : round2(r.valor);
    ajustes.push({ nombre: modName(r), delta });
    subtotal = round2(subtotal + delta);
  }

  if (descuentoOfertaPct > 0) {
    const delta = -round2((subtotal * descuentoOfertaPct) / 100);
    ajustes.push({ nombre: `Oferta -${descuentoOfertaPct}%`, delta });
    subtotal = round2(subtotal + delta);
  }

  subtotal = Math.max(0, subtotal);
  const total = round2(subtotal + montoServicio);

  return { precioBase, ajustes, subtotal, montoServicio, total };
}

/** Divide un total entre N participantes; el resto (centavos) lo asume el organizador. */
export function dividirEnCuotas(total: number, participantes: number): number[] {
  if (participantes < 1) throw new Error('participantes debe ser >= 1');
  const base = Math.floor((total / participantes) * 100) / 100;
  const cuotas = Array<number>(participantes).fill(base);
  const asignado = round2(base * participantes);
  cuotas[0] = round2(cuotas[0]! + (total - asignado));
  return cuotas;
}

export interface PoliticaAbono {
  activo: boolean;
  duracionMinMin: number; // desde cuántos minutos de turno aplica (ej. 120 = 2 h)
  horasAdelanto: number; // cuántas horas se abonan por adelantado (ej. 1)
}

export interface AbonoResultado {
  aplica: boolean;
  montoAbono: number;
  montoRestante: number;
}

/**
 * Reservas largas: muchos clubes exigen abonar por adelantado solo una parte
 * (p.ej. la primera hora) y cobran el resto en efectivo/pago móvil al llegar,
 * antes de entregar la pelota. El abono se prorratea sobre el TOTAL ya
 * calculado (incluye recargos) según la proporción de horas — no
 * recalculamos precio por franja para "la primera hora" específicamente,
 * así que en una franja con recargo variable es una aproximación razonable,
 * no un corte exacto minuto a minuto.
 *
 * Solo se usa en reservas SIN split — con split, el organizador ya cubre el
 * 100% entre las cuotas antes de que la reserva se confirme.
 */
export function calcularAbono(
  total: number,
  duracionMin: number,
  politica: PoliticaAbono,
): AbonoResultado {
  if (!politica.activo || duracionMin < politica.duracionMinMin || politica.horasAdelanto <= 0) {
    return { aplica: false, montoAbono: total, montoRestante: 0 };
  }

  const horasTotales = duracionMin / 60;
  const proporcion = Math.min(1, politica.horasAdelanto / horasTotales);
  const montoAbono = round2(total * proporcion);
  return { aplica: true, montoAbono, montoRestante: round2(total - montoAbono) };
}

function modName(r: ReglaPrecioInput): string {
  return r.tipoModificador === 'PORCENTAJE'
    ? `Ajuste ${r.valor > 0 ? '+' : ''}${r.valor}%`
    : `Ajuste ${r.valor > 0 ? '+' : ''}${r.valor}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
