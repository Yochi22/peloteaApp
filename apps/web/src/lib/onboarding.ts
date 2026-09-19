import { prisma } from '@pelotea/db';
import { obtenerEstadoWhatsapp } from './worker';
import { obtenerTasaVigente } from './tasa-cambio';

export interface PasoOnboarding {
  label: string;
  hecho: boolean;
  href: string;
  accion: string;
}

export interface SedeParaOnboarding {
  id: string;
  precioMoneda: string;
  pagoMovilBanco: string | null;
  pagoMovilCedulaRif: string | null;
  pagoMovilTelefono: string | null;
}

/**
 * Checklist de "primeros pasos" para un club recién creado por `/configurar`
 * — antes no había ninguna guía y el admin llegaba a un panel vacío sin
 * saber qué le faltaba para poder recibir su primera reserva de verdad.
 * Se auto-oculta solo cuando todos los pasos están completos (no hay campo
 * de "descartar" — no hace falta, desaparece solo).
 */
export async function calcularChecklistOnboarding(sede: SedeParaOnboarding): Promise<PasoOnboarding[]> {
  const [canchasActivas, canchaSinHorario, tasa, estadoWhatsapp] = await Promise.all([
    prisma.cancha.count({ where: { sedeId: sede.id, activa: true } }),
    prisma.cancha.findFirst({
      where: { sedeId: sede.id, activa: true, plantillas: { none: {} } },
      select: { id: true },
    }),
    sede.precioMoneda !== 'VES' ? obtenerTasaVigente(sede.precioMoneda) : Promise.resolve(null),
    obtenerEstadoWhatsapp(),
  ]);

  const pagoMovilOk = !!(sede.pagoMovilBanco && sede.pagoMovilCedulaRif && sede.pagoMovilTelefono);

  return [
    { label: 'Crea al menos una cancha', hecho: canchasActivas > 0, href: '/panel/canchas/nueva', accion: 'Crear cancha' },
    {
      label: 'Configura el horario semanal de cada cancha',
      hecho: canchasActivas > 0 && !canchaSinHorario,
      href: '/panel/canchas',
      accion: 'Configurar horario',
    },
    {
      label: 'Carga los datos de pago móvil del club',
      hecho: pagoMovilOk,
      href: '/panel/configuracion',
      accion: 'Cargar datos',
    },
    {
      label: sede.precioMoneda === 'VES' ? 'Tasa de cambio' : `Carga la tasa de cambio de ${sede.precioMoneda}`,
      hecho: sede.precioMoneda === 'VES' || !!tasa,
      href: '/panel/tasa-cambio',
      accion: 'Cargar tasa',
    },
    {
      label: 'Vincula el WhatsApp del club',
      hecho: !!estadoWhatsapp?.conectado,
      href: '/panel/whatsapp',
      accion: 'Vincular',
    },
  ];
}
