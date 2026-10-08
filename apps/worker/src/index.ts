import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES } from '@pelotea/shared';
import { procesarHoldExpirado } from './jobs/hold-expiry';
import { procesarRevisionExpirada } from './jobs/revision-expiry';
import { procesarOfertaDispatch } from './jobs/oferta-dispatch';
import { procesarNotificaciones } from './jobs/notificaciones';
import { procesarLimpiezaComprobantes } from './jobs/limpieza-comprobantes';
import { procesarMaterializarDescuentos } from './jobs/materializar-descuentos';
import { procesarLimpiezaTasaCambio } from './jobs/limpieza-tasa-cambio';
import { procesarExpirarPartidos } from './jobs/expirar-partidos';
import { procesarRecordatorioConfirmarPartido } from './jobs/recordatorio-confirmar-partido';
import { procesarLimpiezaNotificaciones } from './jobs/limpieza-notificaciones';
import { procesarLimpiezaSesiones } from './jobs/limpieza-sesiones';
import { iniciarServidorHttp } from './lib/server';

/**
 * Servicio worker — aislado de la web a propósito. Corre:
 *  - timers de expiración de HOLD y de revisión
 *  - despacho de ofertas (exprés / last-minute) por Web Push + email
 *  - barridos de limpieza (comprobantes, tasa de cambio, notificaciones, sesiones)
 *
 * Ya no corre WhatsApp (Baileys se eliminó por completo): riesgo real de
 * ban de Meta, sesión frágil que se desloguea sola y exige re-escanear un
 * QR, y un worker que tenía que quedarse conectado 24/7 solo para esto. Las
 * notificaciones de acción (reserva confirmada/rechazada/cancelada, etc.)
 * ahora son siempre IN_APP; donde tiene sentido que alguien reenvíe el
 * aviso por su cuenta, la UI ofrece un link `wa.me/...` con el texto ya
 * armado, pero eso es un botón, no un envío automático.
 */
process.on('unhandledRejection', (err) => console.error('unhandledRejection (el proceso sigue vivo):', err));
process.on('uncaughtException', (err) => console.error('uncaughtException (el proceso sigue vivo):', err));

const redisConexion = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
// CRÍTICO: un EventEmitter de Node que emite 'error' sin ningún listener
// tira una excepción no capturada y MATA el proceso entero — de fábrica,
// `ioredis` no tiene ningún listener puesto. Blips de conexión normales en
// Render+Upstash free tier (timeout, ECONNRESET, el primer round-trip al
// despertar de un sleep) generan justo ese 'error' — sin este listener cada
// uno de esos blips reiniciaba TODO el worker, aunque `ioredis` ya iba a
// reconectar solo un instante después. Mismo motivo por el que se quitó el
// `process.exit(1)` de `programarBarridos` más abajo: nunca dejar que un
// hiccup de Redis tumbe el proceso.
redisConexion.on('error', (err) => console.error('Redis (ioredis) error — reconectando solo:', err.message));
const connection: ConnectionOptions = redisConexion;

const defaultJobOpts = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

// Colas (productores; los route handlers de la web también encolan acá).
export const queues = {
  holdExpiry: new Queue(QUEUES.HOLD_EXPIRY, { connection, defaultJobOptions: defaultJobOpts }),
  revisionExpiry: new Queue(QUEUES.REVISION_EXPIRY, { connection, defaultJobOptions: defaultJobOpts }),
  ofertaDispatch: new Queue(QUEUES.OFERTA_DISPATCH, { connection, defaultJobOptions: defaultJobOpts }),
  notificaciones: new Queue(QUEUES.NOTIFICACIONES, { connection, defaultJobOptions: defaultJobOpts }),
  limpiezaComprobantes: new Queue(QUEUES.LIMPIEZA_COMPROBANTES, { connection, defaultJobOptions: defaultJobOpts }),
  materializarDescuentos: new Queue(QUEUES.MATERIALIZAR_DESCUENTOS, { connection, defaultJobOptions: defaultJobOpts }),
  limpiezaTasaCambio: new Queue(QUEUES.LIMPIEZA_TASA_CAMBIO, { connection, defaultJobOptions: defaultJobOpts }),
  expirarPartidos: new Queue(QUEUES.EXPIRAR_PARTIDOS, { connection, defaultJobOptions: defaultJobOpts }),
  recordatorioConfirmarPartido: new Queue(QUEUES.RECORDATORIO_CONFIRMAR_PARTIDO, { connection, defaultJobOptions: defaultJobOpts }),
  limpiezaNotificaciones: new Queue(QUEUES.LIMPIEZA_NOTIFICACIONES, { connection, defaultJobOptions: defaultJobOpts }),
  limpiezaSesiones: new Queue(QUEUES.LIMPIEZA_SESIONES, { connection, defaultJobOptions: defaultJobOpts }),
};
// BullMQ duplica la conexión de Redis por dentro de cada Queue/Worker (la
// necesita para los comandos "blocking") — cada una de esas conexiones
// duplicadas puede emitir su propio 'error' independiente del `connection`
// de arriba. Mismo riesgo de "EventEmitter sin listener mata el proceso".
for (const q of Object.values(queues)) {
  q.on('error', (err) => console.error(`[cola ${q.name}] error de conexión — reconectando solo:`, err.message));
}

const workers: Worker[] = [
  new Worker(QUEUES.HOLD_EXPIRY, procesarHoldExpirado, { connection, concurrency: 5 }),
  new Worker(QUEUES.REVISION_EXPIRY, procesarRevisionExpirada, { connection, concurrency: 5 }),
  new Worker(QUEUES.OFERTA_DISPATCH, procesarOfertaDispatch, { connection, concurrency: 2 }),
  new Worker(QUEUES.NOTIFICACIONES, procesarNotificaciones, { connection, concurrency: 3 }),
  new Worker(QUEUES.LIMPIEZA_COMPROBANTES, procesarLimpiezaComprobantes, { connection, concurrency: 1 }),
  new Worker(QUEUES.MATERIALIZAR_DESCUENTOS, procesarMaterializarDescuentos, { connection, concurrency: 1 }),
  new Worker(QUEUES.LIMPIEZA_TASA_CAMBIO, procesarLimpiezaTasaCambio, { connection, concurrency: 1 }),
  new Worker(QUEUES.EXPIRAR_PARTIDOS, procesarExpirarPartidos, { connection, concurrency: 2 }),
  new Worker(QUEUES.RECORDATORIO_CONFIRMAR_PARTIDO, procesarRecordatorioConfirmarPartido, { connection, concurrency: 1 }),
  new Worker(QUEUES.LIMPIEZA_NOTIFICACIONES, procesarLimpiezaNotificaciones, { connection, concurrency: 1 }),
  new Worker(QUEUES.LIMPIEZA_SESIONES, procesarLimpiezaSesiones, { connection, concurrency: 1 }),
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
  // Una vez al día alcanza de sobra — no es urgente, solo evita que el
  // bucket de comprobantes crezca para siempre.
  await queues.limpiezaComprobantes.upsertJobScheduler(
    'barrido-limpieza-comprobantes',
    { every: 24 * 60 * 60_000 },
    { name: 'barrido' },
  );
  // Convierte reglas de descuento activas (que el admin programó a mano en
  // /panel/descuentos) en filas de Oferta reales para los próximos días —
  // idempotente por @@unique([reglaId, inicioObjetivo]), así que cada media
  // hora alcanza sin trackear qué ya se hizo.
  await queues.materializarDescuentos.upsertJobScheduler(
    'barrido-materializar-descuentos',
    { every: 30 * 60_000 },
    { name: 'barrido' },
  );
  // Una vez al día alcanza — mismo criterio que la limpieza de comprobantes.
  await queues.limpiezaTasaCambio.upsertJobScheduler('barrido-limpieza-tasa-cambio', { every: 24 * 60 * 60_000 }, { name: 'barrido' });
  // Cada 5 min: un partido comunitario cuya hora ya pasó sin completarse
  // (o sin que el organizador confirmara y pagara) no debe quedar
  // "organizándose" para siempre.
  await queues.expirarPartidos.upsertJobScheduler('barrido-expirar-partidos', { every: 5 * 60_000 }, { name: 'barrido' });
  // Cada 30 min alcanza — es un recordatorio único dentro de una ventana de
  // 12h, no una alerta en vivo.
  await queues.recordatorioConfirmarPartido.upsertJobScheduler(
    'barrido-recordatorio-confirmar-partido',
    { every: 30 * 60_000 },
    { name: 'barrido' },
  );
  // Una vez al día — mismo criterio que las otras limpiezas, nada de esto es urgente.
  await queues.limpiezaNotificaciones.upsertJobScheduler('barrido-limpieza-notificaciones', { every: 24 * 60 * 60_000 }, { name: 'barrido' });
  await queues.limpiezaSesiones.upsertJobScheduler('barrido-limpieza-sesiones', { every: 24 * 60 * 60_000 }, { name: 'barrido' });
}

// NUNCA `process.exit()` acá: un fallo transitorio de Redis al arrancar
// (típico en Render+Upstash — el free tier duerme y el primer round-trip al
// despertar puede tardar o fallar) mataba TODO el proceso. `ioredis` ya
// reintenta solo (retryStrategy por defecto) — deja que BullMQ reintente
// también, el barrido se reprograma en el siguiente ciclo si hace falta.
programarBarridos().catch((e) => {
  console.error('No se pudieron programar los barridos (se reintentará solo):', e);
});

for (const w of workers) {
  w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} falló:`, err.message));
  // Mismo motivo que en `queues` arriba: sin esto, un error de conexión en
  // la copia interna de Redis de este Worker tumbaba el proceso entero.
  w.on('error', (err) => console.error(`[worker ${w.name}] error de conexión — reconectando solo:`, err.message));
}

// Puerto HTTP: Render (free tier) solo permite Background Workers en planes
// pagos, pero SÍ deja correr esto gratis como "Web Service" si bindea un
// puerto — de ahí el servidor mínimo, no porque el worker necesite HTTP
// para su trabajo real (BullMQ va por Redis).
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
