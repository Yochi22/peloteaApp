/** Constantes de dominio compartidas entre web y worker. */

export const DEPORTES = [
  'TENIS',
  'PADEL',
  'BEACH_TENNIS',
  'BEACH_PADEL',
  'VOLEIBOL',
  'VOLEY_PLAYA',
  'FUTBOL',
  'FUTSAL',
  'OTRO',
] as const;
export type Deporte = (typeof DEPORTES)[number];

export const SUPERFICIES = [
  'ARCILLA',
  'GRASS',
  'CANCHA_DURA',
  'ARENA',
  'SINTETICO',
  'CRISTAL',
] as const;
export type Superficie = (typeof SUPERFICIES)[number];

export const DEPORTE_LABEL: Record<Deporte, string> = {
  TENIS: 'Tenis',
  PADEL: 'Pádel',
  BEACH_TENNIS: 'Beach tennis',
  BEACH_PADEL: 'Beach pádel',
  VOLEIBOL: 'Vóleibol',
  VOLEY_PLAYA: 'Vóley playa',
  FUTBOL: 'Fútbol',
  FUTSAL: 'Futsal',
  OTRO: 'Otro',
};

export const SUPERFICIE_LABEL: Record<Superficie, string> = {
  ARCILLA: 'Arcilla',
  GRASS: 'Grass / césped',
  CANCHA_DURA: 'Cancha dura',
  ARENA: 'Arena',
  SINTETICO: 'Sintético',
  CRISTAL: 'Cristal',
};

/** Familia de superficie → color base del design system. */
export const SUPERFICIE_TOKEN: Record<Superficie, 'clay' | 'grass' | 'hard'> = {
  ARCILLA: 'clay',
  GRASS: 'grass',
  SINTETICO: 'grass',
  CANCHA_DURA: 'hard',
  CRISTAL: 'hard',
  ARENA: 'clay',
};

/** Defaults de tiempos (se pueden sobrescribir por Sede). */
export const DEFAULT_HOLD_MINUTOS = 15;
export const DEFAULT_REVISION_HORAS = 2;
export const DEFAULT_CANCELACION_HORAS = 6;

/** Anti-abuso. */
export const MAX_RESERVAS_ACTIVAS_SIN_CONFIRMAR = 2;
export const REPUTACION_INICIAL = 100;
export const PENALIZACION_NO_SHOW = 15;
/**
 * Un invitado no tiene cuenta ni `PerfilJugador` — cada reserva suya crea un
 * `Usuario` nuevo, así que no hay reputación que penalizar ahí. Lo único que
 * sobrevive entre una reserva de invitado y la siguiente es su teléfono: si
 * ese número ya acumuló este número de no-shows, se bloquea reservar como
 * invitado (puede seguir reservando si crea una cuenta — igual que dividir
 * el pago, ya exige cuenta).
 */
export const MAX_NO_SHOWS_INVITADO = 2;

export const MONEDA_DEFAULT = 'VES';

/**
 * Plantillas de notificación. Ya no existe WhatsApp automático (Baileys se
 * eliminó por completo: riesgo real de ban de Meta, sesión frágil que se
 * desloguea sola, y un worker que tenía que quedarse conectado 24/7 solo
 * para esto). Todo pasa por IN_APP — para avisos donde además tiene sentido
 * que un humano reenvíe el mensaje por su cuenta, la UI ofrece un botón que
 * abre WhatsApp Web con el texto ya armado (`wa.me/...?text=...`), pero eso
 * es un link, no un envío automático: nunca se guarda como `Notificacion`.
 */
export const PLANTILLAS_NOTIFICACION = {
  RESERVA_CONFIRMADA: 'reserva.confirmada',
  RESERVA_RECHAZADA: 'reserva.rechazada',
  RESERVA_CANCELADA: 'reserva.cancelada',
  COMPROBANTE_RECIBIDO: 'reserva.comprobante_recibido',
  OFERTA_LAST_MINUTE: 'oferta.last_minute',
  OFERTA_EXPRES: 'oferta.expres',
  SPLIT_INVITACION: 'split.invitacion',
  SPLIT_COMPLETO: 'split.completo',
  CUOTA_RECHAZADA: 'cuota.rechazada',
  PARTIDO_COMPLETO: 'partido.completo',
  PARTIDO_CONFIRMADO: 'partido.confirmado',
  PARTIDO_EXPIRADO: 'partido.expirado',
  PARTIDO_CANCELADO: 'partido.cancelado',
  PARTIDO_SIN_DISPONIBILIDAD: 'partido.sin_disponibilidad',
  PARTIDO_RECORDATORIO_CONFIRMAR: 'partido.recordatorio_confirmar',
} as const;

export const CANAL_POR_PLANTILLA: Record<string, ReadonlyArray<'WEB_PUSH' | 'EMAIL' | 'IN_APP'>> = {
  'reserva.confirmada': ['IN_APP'],
  'reserva.rechazada': ['IN_APP'],
  'reserva.cancelada': ['IN_APP'],
  'reserva.comprobante_recibido': ['IN_APP'],
  // marketing → nunca WhatsApp aunque existiera
  'oferta.last_minute': ['WEB_PUSH', 'EMAIL', 'IN_APP'],
  'oferta.expres': ['WEB_PUSH', 'EMAIL', 'IN_APP'],
  'split.invitacion': ['EMAIL', 'IN_APP'],
  'split.completo': ['WEB_PUSH', 'IN_APP'],
  'cuota.rechazada': ['IN_APP'],
  'partido.completo': ['IN_APP'],
  'partido.confirmado': ['IN_APP'],
  'partido.recordatorio_confirmar': ['IN_APP'],
  'partido.expirado': ['IN_APP'],
  'partido.cancelado': ['IN_APP'],
  'partido.sin_disponibilidad': ['IN_APP'],
};

/** Nombres de colas BullMQ. */
export const QUEUES = {
  HOLD_EXPIRY: 'hold-expiry',
  REVISION_EXPIRY: 'revision-expiry',
  OFERTA_DISPATCH: 'oferta-dispatch',
  NOTIFICACIONES: 'notificaciones',
  LIMPIEZA_COMPROBANTES: 'limpieza-comprobantes',
  MATERIALIZAR_DESCUENTOS: 'materializar-descuentos',
  LIMPIEZA_TASA_CAMBIO: 'limpieza-tasa-cambio',
  EXPIRAR_PARTIDOS: 'expirar-partidos',
  RECORDATORIO_CONFIRMAR_PARTIDO: 'recordatorio-confirmar-partido',
  LIMPIEZA_NOTIFICACIONES: 'limpieza-notificaciones',
  LIMPIEZA_SESIONES: 'limpieza-sesiones',
} as const;
