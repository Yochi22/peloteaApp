import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { transicionar, ESTADOS_QUE_OCUPAN_SLOT } from '@pelotea/shared';

/**
 * Libera reservas cuyo HOLD venció: PENDIENTE_PAGO / COMPROBANTE_ENVIADO /
 * EN_REVISION con `holdExpiraEn` o `revisionExpiraEn` pasados → EXPIRADA, y se
 * borra el SlotLock para que el turno vuelva a estar disponible.
 *
 * Idempotente: si otro job ya la expiró, no hace nada.
 */
export async function procesarHoldExpirado(job: Job<{ reservaId?: string }>): Promise<void> {
  const ahora = new Date();

  const vencidas = job.data.reservaId
    ? await prisma.reserva.findMany({ where: { id: job.data.reservaId } })
    : await prisma.reserva.findMany({
        where: {
          estado: 'PENDIENTE_PAGO',
          holdExpiraEn: { lt: ahora },
        },
        take: 200,
      });

  for (const r of vencidas) {
    if (!ESTADOS_QUE_OCUPAN_SLOT.has(r.estado as never)) continue;
    if (r.estado !== 'PENDIENTE_PAGO') continue;
    if (!r.holdExpiraEn || r.holdExpiraEn >= ahora) continue;

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.reserva.findUnique({ where: { id: r.id }, select: { estado: true } });
      if (fresh?.estado !== 'PENDIENTE_PAGO') return; // ganó otra transición

      await tx.reserva.update({
        where: { id: r.id },
        data: { estado: transicionar('PENDIENTE_PAGO', 'EXPIRAR') },
      });
      await tx.slotLock.deleteMany({ where: { reservaId: r.id } });
      await tx.auditLog.create({
        data: {
          sedeId: r.sedeId,
          accion: 'reserva.expirada',
          entidad: 'Reserva',
          entidadId: r.id,
          despues: { motivo: 'hold_vencido' },
        },
      });
    });
  }
}
