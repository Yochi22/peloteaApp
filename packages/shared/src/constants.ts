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

export const MONEDA_DEFAULT = 'VES';

/** Plantillas de notificación. Ofertas/descuentos: nunca WHATSAPP. */
export const PLANTILLAS_NOTIFICACION = {
  RESERVA_CONFIRMADA: 'reserva.confirmada',
  RESERVA_RECHAZADA: 'reserva.rechazada',
  RESERVA_CANCELADA: 'reserva.cancelada',
  COMPROBANTE_RECIBIDO: 'reserva.comprobante_recibido',
  RESERVA_POR_EXPIRAR: 'reserva.por_expirar',
  RECORDATORIO: 'reserva.recordatorio',
  OFERTA_LAST_MINUTE: 'oferta.last_minute',
  OFERTA_EXPRES: 'oferta.expres',
  SPLIT_INVITACION: 'split.invitacion',
  SPLIT_COMPLETO: 'split.completo',
  PARTIDO_COMPLETO: 'partido.completo',
  PARTIDO_CONFIRMADO: 'partido.confirmado',
} as const;

export const CANAL_POR_PLANTILLA: Record<string, ReadonlyArray<'WEB_PUSH' | 'EMAIL' | 'IN_APP' | 'WHATSAPP'>> = {
  'reserva.confirmada': ['WHATSAPP', 'IN_APP'],
  'reserva.rechazada': ['WHATSAPP', 'IN_APP'],
  'reserva.cancelada': ['WHATSAPP', 'IN_APP'],
  'reserva.comprobante_recibido': ['IN_APP'],
  'reserva.por_expirar': ['WHATSAPP', 'IN_APP'],
  'reserva.recordatorio': ['WHATSAPP', 'IN_APP'],
  // marketing → sin WhatsApp
  'oferta.last_minute': ['WEB_PUSH', 'EMAIL', 'IN_APP'],
  'oferta.expres': ['WEB_PUSH', 'EMAIL', 'IN_APP'],
  'split.invitacion': ['EMAIL', 'IN_APP'],
  'split.completo': ['WEB_PUSH', 'IN_APP'],
  // El organizador tiene que actuar (confirmar y pagar) para no perder el
  // grupo — es transaccional/directo, no marketing, así que sí va por
  // WhatsApp (CLAUDE.md §4).
  'partido.completo': ['WHATSAPP', 'IN_APP'],
  'partido.confirmado': ['WHATSAPP', 'IN_APP'],
};

/** Nombres de colas BullMQ. */
export const QUEUES = {
  HOLD_EXPIRY: 'hold-expiry',
  REVISION_EXPIRY: 'revision-expiry',
  OFERTA_DISPATCH: 'oferta-dispatch',
  NOTIFICACIONES: 'notificaciones',
  RECORDATORIOS: 'recordatorios',
  LIMPIEZA_COMPROBANTES: 'limpieza-comprobantes',
  MATERIALIZAR_DESCUENTOS: 'materializar-descuentos',
} as const;
