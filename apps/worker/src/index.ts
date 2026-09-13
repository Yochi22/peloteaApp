import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES } from '@pelotea/shared';
import { procesarHoldExpirado } from './jobs/hold-expiry';
import { procesarRevisionExpirada } from './jobs/revision-expiry';
import { procesarOfertaDispatch } from './jobs/oferta-dispatch';
import { procesarNotificaciones } from './jobs/notificaciones';
import { procesarRecordatorios } from './jobs/recordatorios';
import { procesarLimpiezaComprobantes } from './jobs/limpieza-comprobantes';
import { iniciarWhatsapp } from './lib/whatsapp';
import { iniciarServidorHttp } from './lib/server';

/**
 * Servicio worker — aislado de la web a propósito. Corre:
 *  - timers de expiración de HOLD y de revisión
 *  - despacho de ofertas (exprés / last-minute) por Web Push + email
 *  - cola de salida de WhatsApp (Baileys) — SOLO transaccional
 *
 * Si WhatsApp se cae o nos banean, la web sigue funcionando.
 */

const connection: ConnectionOptions = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const defaultJobOpts = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

// Colas (productores; los route handlers de la web también encolan acá).
// `WHATSAPP_OUT` no está acá a propósito: el envío de WhatsApp se hace
// directo desde `procesarNotificaciones` (canal WHATSAPP) contra
// `lib/whatsapp.ts`, sin una cola intermedia — una cola declarada pero sin
// ningún productor ni consumidor real es peor que no tenerla (parece
// infraestructura viva y no lo es).
export const queues = {
  holdExpiry: new Queue(QUEUES.HOLD_EXPIRY, { connection, defaultJobOptions: defaultJobOpts }),
  revisionExpiry: new Queue(QUEUES.REVISION_EXPIRY, { connection, defaultJobOptions: defaultJobOpts }),
  ofertaDispatch: new Queue(QUEUES.OFERTA_DISPATCH, { connection, defaultJobOptions: defaultJobOpts }),
  notificaciones: new Queue(QUEUES.NOTIFICACIONES, { connection, defaultJobOptions: defaultJobOpts }),
  recordatorios: new Queue(QUEUES.RECORDATORIOS, { connection, defaultJobOptions: defaultJobOpts }),
  limpiezaComprobantes: new Queue(QUEUES.LIMPIEZA_COMPROBANTES, { connection, defaultJobOptions: defaultJobOpts }),
};

const workers: Worker[] = [
  new Worker(QUEUES.HOLD_EXPIRY, procesarHoldExpirado, { connection, concurrency: 5 }),
  new Worker(QUEUES.REVISION_EXPIRY, procesarRevisionExpirada, { connection, concurrency: 5 }),
  new Worker(QUEUES.OFERTA_DISPATCH, procesarOfertaDispatch, { connection, concurrency: 2 }),
  new Worker(QUEUES.NOTIFICACIONES, procesarNotificaciones, { connection, concurrency: 3 }),
  new Worker(QUEUES.RECORDATORIOS, procesarRecordatorios, { connection, concurrency: 2 }),
  new Worker(QUEUES.LIMPIEZA_COMPROBANTES, procesarLimpiezaComprobantes, { connection, concurrency: 1 }),
];

// Barrido periódico: transiciona holds/revisiones vencidos y despacha ofertas
// nuevas, aunque se pierda un job puntual.
async function programarBarridos() {
  await queues.holdExpiry.upsertJobScheduler('barrido-holds', { every: 60_000 }, { name: 'barrido' });
  await queues.revisionExpiry.upsertJobScheduler(
    'barrido-revisiones',
    { every: 120_000 },
    { name: 'barrido' },
  );
  await queues.ofertaDispatch.upsertJobScheduler('barrido-ofertas', { every: 30_000 }, { name: 'barrido' });
  await queues.notificaciones.upsertJobScheduler('barrido-notificaciones', { every: 15_000 }, { name: 'barrido' });
  await queues.recordatorios.upsertJobScheduler('barrido-recordatorios', { every: 15 * 60_000 }, { name: 'barrido' });
  // Una vez al día alcanza de sobra — no es urgente, solo evita que el
  // bucket de comprobantes crezca para siempre.
  await queues.limpiezaComprobantes.upsertJobScheduler(
    'barrido-limpieza-comprobantes',
    { every: 24 * 60 * 60_000 },
    { name: 'barrido' },
  );
}

// NUNCA `process.exit()` acá: un fallo transitorio de Redis al arrancar
// (típico en Render+Upstash — el free tier duerme y el primer round-trip al
// despertar puede tardar o fallar) mataba TODO el proceso, incluyendo el
// servidor HTTP y Baileys, antes de que el QR llegara a generarse. `ioredis`
// ya reintenta solo (retryStrategy por defecto) — deja que BullMQ reintente
// también, el barrido se reprograma en el siguiente ciclo si hace falta.
programarBarridos().catch((e) => {
  console.error('No se pudieron programar los barridos (se reintentará solo):', e);
});

for (const w of workers) {
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} falló:`, err.message));
}

// Se conecta al arrancar (no espera al primer mensaje) para que el QR de
// emparejamiento esté disponible desde el principio — importante en un
// hosting donde revisar el log a tiempo real es incómodo (ver `/qr` abajo).
iniciarWhatsapp().catch((e) => console.error('No se pudo iniciar WhatsApp:', e));

// Puerto HTTP: Render (free tier) solo permite Background Workers en planes
// pagos, pero SÍ deja correr esto gratis como "Web Service" si bindea un
// puerto — de ahí el servidor mínimo, no porque el worker necesite HTTP
// para su trabajo real (BullMQ/Baileys van por Redis/websocket propios).
iniciarServidorHttp(Number(process.env.PORT ?? 3001));

console.log(`worker arriba — colas: ${Object.values(QUEUES).join(', ')}`);

async function shutdown() {
  console.log('cerrando worker…');
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(Object.values(queues).map((q) => q.close()));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
