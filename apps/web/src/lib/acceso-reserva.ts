import type { Sesion } from './session';

/**
 * ¿Puede este visitante actuar sobre esta reserva? Dos caminos válidos:
 *  - tiene sesión y es el organizador, o
 *  - no tiene cuenta pero presenta el `accessToken` exacto de la reserva
 *    (reserva de invitado — ver CLAUDE.md §3).
 * El token se compara siempre contra el de la reserva, nunca al revés, y solo
 * cuenta si la reserva efectivamente tiene uno (las de usuarios con cuenta
 * llevan `accessToken: null`, así que un token vacío nunca "matchea por accidente").
 */
export function puedeAccederReserva(
  sesion: Sesion | null,
  reserva: { organizadorId: string; accessToken: string | null },
  tokenQuery: string | null,
): boolean {
  if (sesion) return reserva.organizadorId === sesion.usuarioId;
  return !!reserva.accessToken && !!tokenQuery && tokenQuery === reserva.accessToken;
}
