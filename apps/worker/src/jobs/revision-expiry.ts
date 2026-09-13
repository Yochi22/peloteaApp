import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { transicionar } from '@pelotea/shared';

/**
 * Reservas en COMPROBANTE_ENVIADO / EN_REVISION cuyo plazo de decisión del club
 * (`revisionExpiraEn`) venció → EXPIRADA y se libera el turno. Evita que un
 * comprobante sin resolver bloquee el slot para siempre.
 */
export async function procesarRevisionExpirada(_job: Job): Promise<void> {
  const ahora = new Date();

  const vencidas = await prisma.reserva.findMany({
    where: {
      estado: { in: ['COMPROBANTE_ENVIADO', 'EN_REVISION'] },
      revisionExpiraEn: { lt: ahora },
    },
    take: 200,
  });

  for (const r of vencidas) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.reserva.findUnique({ where: { id: r.id }, select: { estado: true } });
      if (fresh?.estado !== 'COMPROBANTE_ENVIADO' && fresh?.estado !== 'EN_REVISION') return;

      await tx.reserva.update({
        where: { id: r.id },
        data: { estado: transicionar(fresh.estado, 'EXPIRAR') },
      });
      await tx.slotLock.deleteMany({ where: { reservaId: r.id } });
      await tx.auditLog.create({
        data: {
          sedeId: r.sedeId,
          accion: 'reserva.expirada',
          entidad: 'Reserva',
          entidadId: r.id,
          despues: { motivo: 'revision_vencida' },
        },
      });
    });
  }
}
