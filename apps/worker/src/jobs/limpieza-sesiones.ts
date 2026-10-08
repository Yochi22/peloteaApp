import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';

/**
 * Cada login crea una fila en `Sesion` — nada las borraba cuando vencían
 * solas (solo se borran a mano en logout o al desactivar una cuenta de
 * staff). Sin este barrido, la tabla crece para siempre con sesiones
 * muertas que ya no le sirven a nadie (`getSesion()` ya las trata como
 * inválidas en cuanto `expiraEn` pasó).
 */
export async function procesarLimpiezaSesiones(_job: Job): Promise<void> {
  await prisma.sesion.deleteMany({ where: { expiraEn: { lt: new Date() } } });
}
