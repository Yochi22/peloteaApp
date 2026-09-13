import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { PLANTILLAS_NOTIFICACION } from '@pelotea/shared';

/**
 * Recordatorio de partido ~3 h antes del turno, solo para reservas ya
 * CONFIRMADA. Idempotente por payload (no reenvía si ya existe una
 * `Notificacion` de este tipo para esa reserva) — igual patrón que
 * `oferta-dispatch`. Va por WhatsApp (transaccional) + IN_APP.
 */
export async function procesarRecordatorios(_job: Job): Promise<void> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() + 2 * 3_600_000);
  const hasta = new Date(ahora.getTime() + 4 * 3_600_000);

  const reservas = await prisma.reserva.findMany({
    where: { estado: 'CONFIRMADA', inicio: { gte: desde, lt: hasta } },
    select: { id: true, organizadorId: true, inicio: true },
    take: 200,
  });

  for (const r of reservas) {
    const yaEnviado = await prisma.notificacion.findFirst({
      where: {
        usuarioId: r.organizadorId,
        plantilla: PLANTILLAS_NOTIFICACION.RECORDATORIO,
        payload: { path: ['reservaId'], equals: r.id },
      },
      select: { id: true },
    });
    if (yaEnviado) continue;

    await prisma.notificacion.createMany({
      data: [
        {
          usuarioId: r.organizadorId,
          canal: 'WHATSAPP',
          plantilla: PLANTILLAS_NOTIFICACION.RECORDATORIO,
          payload: { reservaId: r.id, inicio: r.inicio.toISOString() },
        },
        {
          usuarioId: r.organizadorId,
          canal: 'IN_APP',
          plantilla: PLANTILLAS_NOTIFICACION.RECORDATORIO,
          payload: { reservaId: r.id, inicio: r.inicio.toISOString() },
        },
      ],
    });
  }
}
