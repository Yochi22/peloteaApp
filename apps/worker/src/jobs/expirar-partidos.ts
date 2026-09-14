import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { PLANTILLAS_NOTIFICACION } from '@pelotea/shared';

/**
 * Un partido comunitario ABIERTO (nunca se llenó) o COMPLETO (se llenó pero
 * el organizador nunca confirmó y pagó) que ya pasó su `inicio` no tiene
 * ningún sentido dejarlo así para siempre — nadie va a reservar una hora
 * que ya pasó. Lo marca EXPIRADO y avisa (in-app, no urgente) a todos los
 * que se habían unido, incluyendo al organizador.
 *
 * Uno con estado COMPLETO que además ya tiene una Reserva activa (el
 * organizador SÍ llegó a confirmar) no entra acá — ese partido sigue su
 * curso normal (CONFIRMADO cuando se apruebe el pago), pase lo que pase con
 * la hora del turno en sí.
 */
export async function procesarExpirarPartidos(_job: Job): Promise<void> {
  const ahora = new Date();
  const candidatos = await prisma.partidoAbierto.findMany({
    where: { estado: { in: ['ABIERTO', 'COMPLETO'] }, inicio: { lt: ahora } },
    include: { reserva: true, participantes: { select: { usuarioId: true } } },
  });

  for (const p of candidatos) {
    if (p.reserva && !['CANCELADA', 'EXPIRADA'].includes(p.reserva.estado)) continue;

    await prisma.partidoAbierto.update({ where: { id: p.id }, data: { estado: 'EXPIRADO' } });

    const destinatarios = new Set(p.participantes.map((pp) => pp.usuarioId));
    destinatarios.add(p.organizadorId);
    await prisma.notificacion.createMany({
      data: Array.from(destinatarios).map((usuarioId) => ({
        usuarioId,
        canal: 'IN_APP' as const,
        plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_EXPIRADO,
        payload: { partidoId: p.id },
      })),
    });
  }
}
