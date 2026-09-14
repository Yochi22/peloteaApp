import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { PLANTILLAS_NOTIFICACION } from '@pelotea/shared';

/**
 * El cronómetro de una reserva (staff lo arranca cuando el cliente retira
 * la pelota, ver `/api/reservas/[id]/iniciar-tiempo`) cuenta `duracionMin`
 * minutos desde `tiempoIniciadoEn`, no desde `Reserva.inicio` — un cliente
 * puede llegar tarde. Este barrido avisa al staff/admin de la sede
 * (WhatsApp + in-app, a CADA UNO en su propio teléfono) cuando ese tiempo
 * se cumple, para que vayan a recoger la pelota. `tiempoAlertaEnviada`
 * evita mandarla dos veces.
 */
export async function procesarAlertaCronometro(_job: Job): Promise<void> {
  const candidatas = await prisma.reserva.findMany({
    where: { estado: 'CONFIRMADA', tiempoIniciadoEn: { not: null }, tiempoAlertaEnviada: false },
    include: { cancha: true, organizador: { select: { nombre: true } } },
  });

  const ahora = Date.now();
  for (const r of candidatas) {
    const duracionMs = r.fin.getTime() - r.inicio.getTime();
    const finTiempo = r.tiempoIniciadoEn!.getTime() + duracionMs;
    if (finTiempo > ahora) continue; // todavía no se cumplió

    const staff = await prisma.usuario.findMany({
      where: { sedeId: r.sedeId, rol: { in: ['SEDE_STAFF', 'SEDE_ADMIN'] } },
      select: { id: true },
    });
    if (staff.length > 0) {
      const payload = { reservaId: r.id, cancha: r.cancha.nombre, persona: r.organizador.nombre };
      await prisma.notificacion.createMany({
        data: staff.flatMap((u) => [
          { usuarioId: u.id, canal: 'WHATSAPP' as const, plantilla: PLANTILLAS_NOTIFICACION.CRONOMETRO_TERMINADO, payload },
          { usuarioId: u.id, canal: 'IN_APP' as const, plantilla: PLANTILLAS_NOTIFICACION.CRONOMETRO_TERMINADO, payload },
        ]),
      });
    }
    await prisma.reserva.update({ where: { id: r.id }, data: { tiempoAlertaEnviada: true } });
  }
}
