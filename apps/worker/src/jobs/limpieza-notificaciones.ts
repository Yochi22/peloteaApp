import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';

const RETENCION_DIAS = 30;

/**
 * Las `Notificacion` son avisos de un momento puntual ("se llenó tu
 * partido", "tu pago fue aprobado") — una vez que alguien las vio (o pasó
 * tiempo de sobra para verlas), no aportan nada quedarse acumulando para
 * siempre. Borra cualquiera de más de 30 días, leída o no — el historial
 * de lo que de verdad importa (reservas, pagos, auditoría) vive en sus
 * propias tablas, no en esta.
 */
export async function procesarLimpiezaNotificaciones(_job: Job): Promise<void> {
  const limite = new Date(Date.now() - RETENCION_DIAS * 24 * 60 * 60_000);
  await prisma.notificacion.deleteMany({ where: { createdAt: { lt: limite } } });
}
