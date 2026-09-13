/** Estados de una Cuota (parte del split que paga cada participante). */
export type EstadoCuota = 'PENDIENTE' | 'PAGADA' | 'APROBADA' | 'VENCIDA';

const TRANSICIONES: Record<EstadoCuota, EstadoCuota[]> = {
  PENDIENTE: ['PAGADA', 'VENCIDA'],
  PAGADA: ['APROBADA', 'PENDIENTE'], // rechazar devuelve a pendiente
  APROBADA: [],
  VENCIDA: [],
};

export function puedeTransicionarCuota(desde: EstadoCuota, hacia: EstadoCuota): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function transicionarCuota(desde: EstadoCuota, hacia: EstadoCuota): EstadoCuota {
  if (!puedeTransicionarCuota(desde, hacia)) {
    throw new Error(`Transición de cuota inválida: ${desde} → ${hacia}`);
  }
  return hacia;
}

/** ¿Todas las cuotas de una reserva están aprobadas (split completo)? */
export function splitCompleto(cuotas: Array<{ estado: EstadoCuota }>): boolean {
  return cuotas.length > 0 && cuotas.every((c) => c.estado === 'APROBADA');
}
