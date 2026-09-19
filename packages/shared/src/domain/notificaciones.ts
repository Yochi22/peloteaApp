/**
 * Texto de cada plantilla de notificación — compartido entre el worker (que
 * la manda por WhatsApp/push/email) y la web (que muestra las IN_APP en
 * `/notificaciones`), para no mantener el mismo switch en dos lugares.
 */
export function renderTextoNotificacion(
  plantilla: string,
  payload: Record<string, unknown>,
): { titulo: string; cuerpo: string } {
  switch (plantilla) {
    case 'reserva.confirmada':
      return { titulo: 'Reserva confirmada ✅', cuerpo: 'Tu cancha quedó confirmada. ¡Nos vemos en la cancha!' };
    case 'reserva.rechazada':
      return { titulo: 'Pago rechazado', cuerpo: `El club no pudo validar tu comprobante. ${payload.motivo ?? ''}`.trim() };
    case 'reserva.cancelada':
      return payload.porElClub
        ? { titulo: 'El club canceló tu reserva', cuerpo: `${payload.motivo ?? 'Sin motivo especificado'} — si ya pagaste algo, el club te lo coordina por fuera de la app.` }
        : { titulo: 'Reserva cancelada', cuerpo: 'Confirmamos la cancelación. Recuerda que el abono no se devuelve.' };
    case 'oferta.last_minute':
      return { titulo: 'Cancha liberada cerca de tu zona 🎾', cuerpo: `Precio especial: Bs ${payload.precioFinal}.` };
    case 'oferta.expres':
      return { titulo: 'Descuento exprés disponible', cuerpo: `Precio especial: Bs ${payload.precioFinal}.` };
    case 'split.completo':
      return { titulo: 'Split completo — reserva confirmada', cuerpo: 'Todos pagaron su parte. ¡A jugar!' };
    case 'reserva.recordatorio': {
      const hora = payload.inicio
        ? new Date(String(payload.inicio)).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })
        : 'pronto';
      return { titulo: 'Tu partido es en unas horas ⏰', cuerpo: `Empieza a las ${hora}. ¡Nos vemos en la cancha!` };
    }
    case 'partido.completo':
      return {
        titulo: 'Tu partido se llenó — falta confirmar',
        cuerpo: 'Ya tienes los jugadores que faltaban. Entra a tu cuenta para confirmar y pagar antes de que alguien más tome ese horario.',
      };
    case 'partido.confirmado':
      return { titulo: 'Partido confirmado ✅', cuerpo: 'Ya se reservó la cancha y se aprobó el pago. ¡Nos vemos ahí!' };
    case 'partido.expirado':
      return {
        titulo: 'El partido no se completó a tiempo',
        cuerpo: 'Pasó la hora sin llenarse el cupo o sin confirmarse el pago — el partido quedó cerrado. Puedes crear uno nuevo.',
      };
    case 'partido.cancelado':
      return {
        titulo: 'El organizador canceló el partido',
        cuerpo: 'El partido al que te uniste ya no va a jugarse. Busca otro o crea uno nuevo.',
      };
    case 'partido.sin_disponibilidad':
      return {
        titulo: 'No se pudo confirmar el partido',
        cuerpo: 'Se llenaron los cupos pero ya no había ninguna cancha libre a esa hora. El organizador puede reintentar más tarde o el partido se cae.',
      };
    case 'reserva.cronometro_terminado':
      return {
        titulo: '⏰ Se acabó el tiempo',
        cuerpo: `${payload.cancha ?? 'La cancha'} — ${payload.persona ?? 'el cliente'} ya cumplió su hora. Hay que ir a recoger la pelota.`,
      };
    default:
      return { titulo: 'Pelotea', cuerpo: 'Tienes una novedad en tu cuenta.' };
  }
}
