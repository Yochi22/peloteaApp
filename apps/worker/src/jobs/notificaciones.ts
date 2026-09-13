import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { renderTextoNotificacion } from '@pelotea/shared';
import { enviarPush } from '../lib/push';
import { enviarWhatsapp } from '../lib/whatsapp';

/**
 * Despacha `Notificacion` en estado PENDIENTE según su canal.
 * IN_APP no requiere envío (el front la lee de la DB). EMAIL/WEB_PUSH/WHATSAPP
 * se marcan ENVIADA o FALLIDA (con reintento vía BullMQ si tira).
 */
export async function procesarNotificaciones(_job: Job): Promise<void> {
  const pendientes = await prisma.notificacion.findMany({
    where: { estado: 'PENDIENTE' },
    include: { usuario: { select: { telefono: true, email: true } } },
    take: 100,
    orderBy: { createdAt: 'asc' },
  });

  for (const n of pendientes) {
    try {
      const texto = renderTextoNotificacion(n.plantilla, n.payload as Record<string, unknown>);

      switch (n.canal) {
        case 'IN_APP':
          await marcar(n.id, 'ENVIADA');
          break;

        case 'WEB_PUSH': {
          const ok = await enviarPush(n.usuarioId, { titulo: texto.titulo, cuerpo: texto.cuerpo });
          await marcar(n.id, ok ? 'ENVIADA' : 'FALLIDA', ok ? undefined : 'sin suscripciones push válidas');
          break;
        }

        case 'EMAIL':
          // TODO: integrar Resend/SMTP (RESEND_API_KEY). Por ahora se registra.
          console.log(`[email] a ${n.usuario.email}: ${texto.titulo} — ${texto.cuerpo}`);
          await marcar(n.id, 'ENVIADA');
          break;

        case 'WHATSAPP':
          if (!n.usuario.telefono) {
            await marcar(n.id, 'FALLIDA', 'usuario sin teléfono');
            break;
          }
          await enviarWhatsapp(n.usuario.telefono, `${texto.titulo}\n${texto.cuerpo}`);
          await marcar(n.id, 'ENVIADA');
          break;
      }
    } catch (err) {
      console.error(`notificación ${n.id} falló:`, err);
      await marcar(n.id, 'FALLIDA', String(err));
    }
  }
}

async function marcar(id: string, estado: 'ENVIADA' | 'FALLIDA', error?: string) {
  await prisma.notificacion.update({ where: { id }, data: { estado, enviadaEn: new Date(), error } });
}
