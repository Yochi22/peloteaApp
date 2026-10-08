import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { PLANTILLAS_NOTIFICACION } from '@pelotea/shared';

/**
 * Un partido comunitario COMPLETO (cupo lleno) puede quedarse días sin que
 * el organizador confirme y pague — antes la única señal era el vencimiento
 * automático al pasar `inicio` (`jobs/expirar-partidos.ts`), que puede ser
 * días después de llenarse el cupo, dejando al organizador sin ningún
 * empujón intermedio. Este barrido le recuerda UNA vez, entre 12 y 24 horas
 * antes del turno — ni tan pronto que parezca apuro, ni tan tarde que ya no
 * pueda reaccionar. Idempotente por payload (no reenvía si ya existe una
 * `Notificacion` de este tipo para ese partido).
 */
export async function procesarRecordatorioConfirmarPartido(_job: Job): Promise<void> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() + 12 * 3_600_000);
  const hasta = new Date(ahora.getTime() + 24 * 3_600_000);

  const partidos = await prisma.partidoAbierto.findMany({
    where: { estado: 'COMPLETO', inicio: { gte: desde, lt: hasta } },
    include: { reserva: true },
    take: 200,
  });

  for (const p of partidos) {
    // Si ya tiene una reserva activa, el organizador ya confirmó — nada que recordar.
    if (p.reserva && !['CANCELADA', 'EXPIRADA'].includes(p.reserva.estado)) continue;

    const yaEnviado = await prisma.notificacion.findFirst({
      where: {
        usuarioId: p.organizadorId,
        plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_RECORDATORIO_CONFIRMAR,
        payload: { path: ['partidoId'], equals: p.id },
      },
      select: { id: true },
    });
    if (yaEnviado) continue;

    await prisma.notificacion.create({
      data: { usuarioId: p.organizadorId, canal: 'IN_APP', plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_RECORDATORIO_CONFIRMAR, payload: { partidoId: p.id } },
    });
  }
}
