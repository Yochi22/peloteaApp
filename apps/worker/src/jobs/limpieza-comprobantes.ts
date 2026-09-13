import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { borrarComprobante } from '../lib/storage';

/**
 * Borra del bucket los comprobantes de pagos ya RESUELTOS (aprobados o
 * rechazados) hace más de `COMPROBANTE_RETENCION_DIAS` (default 90) — sin
 * esto, el bucket de comprobantes crece para siempre con capturas de pago
 * móvil que ya nadie necesita ver, y en un plan de storage con límite
 * (Backblaze B2 free, por ejemplo) eso es plata o directo se llena.
 *
 * Nunca toca un pago EN_REVISION/PENDIENTE (todavía en uso activo). Solo
 * borra el archivo del bucket y limpia `comprobanteKey` — el `Pago` en sí
 * se queda (monto, método, quién aprobó, cuándo) para no perder el rastro
 * contable, solo se pierde la imagen.
 */
export async function procesarLimpiezaComprobantes(_job: Job): Promise<void> {
  const dias = Number(process.env.COMPROBANTE_RETENCION_DIAS ?? 90);
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const candidatos = await prisma.pago.findMany({
    where: {
      comprobanteKey: { not: null },
      estado: { in: ['APROBADO', 'RECHAZADO'] },
      updatedAt: { lt: corte },
    },
    select: { id: true, comprobanteKey: true },
    take: 200,
  });

  for (const p of candidatos) {
    if (!p.comprobanteKey) continue;
    try {
      await borrarComprobante(p.comprobanteKey);
      await prisma.pago.update({ where: { id: p.id }, data: { comprobanteKey: null } });
    } catch (err) {
      // Un fallo puntual (bucket lento, etc.) no debe tumbar el barrido
      // completo — se reintenta solo en la próxima corrida.
      console.error(`limpieza-comprobantes: no se pudo borrar el pago ${p.id}:`, err);
    }
  }

  if (candidatos.length > 0) {
    console.log(`limpieza-comprobantes: ${candidatos.length} comprobante(s) borrados (retención ${dias} días).`);
  }
}
