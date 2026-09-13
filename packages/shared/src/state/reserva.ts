/**
 * Máquina de estados de la Reserva. TODA transición pasa por acá — los handlers
 * no cambian `estado` a mano. Ver CLAUDE.md §3.
 */

export const ESTADOS_RESERVA = [
  'BORRADOR',
  'PENDIENTE_PAGO',
  'COMPROBANTE_ENVIADO',
  'EN_REVISION',
  'CONFIRMADA',
  'COMPLETADA',
  'NO_SHOW',
  'CANCELADA',
  'EXPIRADA',
] as const;

export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

export type EventoReserva =
  | 'INICIAR_PAGO' // BORRADOR → PENDIENTE_PAGO (toma el HOLD)
  | 'ENVIAR_COMPROBANTE' // PENDIENTE_PAGO → COMPROBANTE_ENVIADO
  | 'TOMAR_EN_REVISION' // COMPROBANTE_ENVIADO → EN_REVISION
  | 'APROBAR' // COMPROBANTE_ENVIADO | EN_REVISION → CONFIRMADA
  | 'RECHAZAR' // COMPROBANTE_ENVIADO | EN_REVISION → PENDIENTE_PAGO
  | 'EXPIRAR' // PENDIENTE_PAGO | COMPROBANTE_ENVIADO | EN_REVISION → EXPIRADA
  | 'CANCELAR' // PENDIENTE_PAGO | COMPROBANTE_ENVIADO | EN_REVISION | CONFIRMADA → CANCELADA
  | 'COMPLETAR' // CONFIRMADA → COMPLETADA
  | 'MARCAR_NO_SHOW'; // CONFIRMADA → NO_SHOW

const TRANSICIONES: Record<EstadoReserva, Partial<Record<EventoReserva, EstadoReserva>>> = {
  BORRADOR: {
    INICIAR_PAGO: 'PENDIENTE_PAGO',
    CANCELAR: 'CANCELADA',
  },
  PENDIENTE_PAGO: {
    ENVIAR_COMPROBANTE: 'COMPROBANTE_ENVIADO',
    EXPIRAR: 'EXPIRADA',
    CANCELAR: 'CANCELADA',
  },
  COMPROBANTE_ENVIADO: {
    TOMAR_EN_REVISION: 'EN_REVISION',
    APROBAR: 'CONFIRMADA',
    RECHAZAR: 'PENDIENTE_PAGO',
    EXPIRAR: 'EXPIRADA',
    CANCELAR: 'CANCELADA',
  },
  EN_REVISION: {
    APROBAR: 'CONFIRMADA',
    RECHAZAR: 'PENDIENTE_PAGO',
    EXPIRAR: 'EXPIRADA',
    CANCELAR: 'CANCELADA',
  },
  CONFIRMADA: {
    COMPLETAR: 'COMPLETADA',
    MARCAR_NO_SHOW: 'NO_SHOW',
    CANCELAR: 'CANCELADA',
  },
  COMPLETADA: {},
  NO_SHOW: {},
  CANCELADA: {},
  EXPIRADA: {},
};

/** Estados en los que la reserva OCUPA el slot (existe un SlotLock). */
export const ESTADOS_QUE_OCUPAN_SLOT: ReadonlySet<EstadoReserva> = new Set([
  'PENDIENTE_PAGO',
  'COMPROBANTE_ENVIADO',
  'EN_REVISION',
  'CONFIRMADA',
]);

export const ESTADOS_TERMINALES: ReadonlySet<EstadoReserva> = new Set([
  'COMPLETADA',
  'NO_SHOW',
  'CANCELADA',
  'EXPIRADA',
]);

export function puedeTransicionar(desde: EstadoReserva, evento: EventoReserva): boolean {
  return TRANSICIONES[desde]?.[evento] !== undefined;
}

export class TransicionInvalidaError extends Error {
  constructor(
    public readonly desde: EstadoReserva,
    public readonly evento: EventoReserva,
  ) {
    super(`Transición inválida: no se puede "${evento}" desde "${desde}".`);
    this.name = 'TransicionInvalidaError';
  }
}

/** Aplica la transición o lanza. Devuelve el nuevo estado. */
export function transicionar(desde: EstadoReserva, evento: EventoReserva): EstadoReserva {
  const destino = TRANSICIONES[desde]?.[evento];
  if (!destino) throw new TransicionInvalidaError(desde, evento);
  return destino;
}

/**
 * Lleva una reserva directo a CONFIRMADA sin pasar por la cola de revisión —
 * para pagos que ya llegan verificados (split completo). Encadena los
 * mismos hops que un flujo normal (nunca "fuerza" el estado), así que sigue
 * validando cada transición.
 */
export function confirmarDirectamente(estado: EstadoReserva): EstadoReserva {
  let actual = estado;
  if (actual === 'PENDIENTE_PAGO') actual = transicionar(actual, 'ENVIAR_COMPROBANTE');
  if (actual === 'COMPROBANTE_ENVIADO' || actual === 'EN_REVISION') actual = transicionar(actual, 'APROBAR');
  return actual;
}

/**
 * ¿Cancelar esta reserva confirmada debe generar una oferta LAST_MINUTE?
 * Sí cuando falta menos que la ventana de cancelación de la sede.
 */
export function debeGenerarLastMinute(
  inicio: Date,
  ahora: Date,
  ventanaCancelacionHoras: number,
): boolean {
  const horasRestantes = (inicio.getTime() - ahora.getTime()) / 3_600_000;
  return horasRestantes > 0 && horasRestantes <= ventanaCancelacionHoras;
}
