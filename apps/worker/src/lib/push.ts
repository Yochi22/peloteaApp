import webpush from 'web-push';
import { prisma } from '@pelotea/db';

const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC ?? '';
const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE ?? '';
const contacto = process.env.WEB_PUSH_CONTACT ?? 'mailto:soporte@pelotea.app';

let configurado = false;
function asegurarConfig() {
  if (configurado) return;
  if (!publicKey || !privateKey) {
    console.warn('WEB_PUSH_VAPID_* no configurado — las notificaciones push se omiten.');
    return;
  }
  webpush.setVapidDetails(contacto, publicKey, privateKey);
  configurado = true;
}

export interface PushPayload {
  titulo: string;
  cuerpo: string;
  url?: string;
}

/** Envía a TODAS las suscripciones del usuario; borra las que ya no son válidas (410/404). */
export async function enviarPush(usuarioId: string, payload: PushPayload): Promise<boolean> {
  asegurarConfig();
  if (!configurado) return false;

  const subs = await prisma.pushSubscription.findMany({ where: { usuarioId } });
  if (subs.length === 0) return false;

  let algunEnviado = false;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      algunEnviado = true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error('push falló:', err);
      }
    }
  }
  return algunEnviado;
}
