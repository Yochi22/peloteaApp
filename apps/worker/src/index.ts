import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES } from '@pelotea/shared';
import { procesarHoldExpirado } from './jobs/hold-expiry';
import { procesarRevisionExpirada } from './jobs/revision-expiry';
import { procesarOfertaDispatch } from './jobs/oferta-dispatch';
import { procesarNotificaciones } from './jobs/notificaciones';
import { procesarRecordatorios } from './jobs/recordatorios';
import { procesarLimpiezaComprobantes } from './jobs/limpieza-comprobantes';
import { procesarMaterializarDescuentos } from './jobs/materializar-descuentos';
import { procesarAlertaCronometro } from './jobs/alerta-cronometro';
import { procesarLimpiezaTasaCambio } from './jobs/limpieza-tasa-cambio';
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

// Red de seguridad final: Baileys (WhatsApp) reconecta agresivamente por
// dentro y puede tirar un rechazo o una excepción que no pase por ninguno
// de los `.catch`/`.on('error')` de este archivo. Sin esto, cualquiera de
// esos casos mataba el proceso completo — exactamente el síntoma reportado
// ("nunca aparece el QR", "reiniciar no encuentra el worker"): un
// crash-loop constante nunca deja a Baileys terminar de conectar. Loguear
// y seguir vivo es mejor que reiniciar todo por un error que ya se maneja
// solo (reconexión) en otro lado.
process.on('unhandledRejection', (err) => console.error('unhandledRejection (el proceso sigue vivo):', err));
process.on('uncaughtException', (err) => console.error('uncaughtException (el proceso sigue vivo):', err));

const redisConexion = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
// CRÍTICO: un EventEmitter de Node que emite 'error' sin ningún listener
// tira una excepción no capturada y MATA el proceso entero — de fábrica,
// `ioredis` no tiene ningún listener puesto. Blips de conexión normales en
// Render+Upstash free tier (timeout, ECONNRESET, el primer round-trip al
// despertar de un sleep) generan justo ese 'error', y sin este listener
// cada uno de esos blips reiniciaba TODO el worker — WhatsApp incluido —
// aunque `ioredis` ya iba a reconectar solo un instante después. Mismo
// motivo por el que se quitó el `process.exit(1)` de `programarBarridos`
// más abajo: nunca dejar que un hiccup de Redis tumbe el proceso.
redisConexion.on('error', (err) => console.error('Redis (ioredis) error — reconectando solo:', err.message));
const connection: ConnectionOptions = redisConexion;

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
  materializarDescuentos: new Queue(QUEUES.MATERIALIZAR_DESCUENTOS, { connection, defaultJobOptions: defaultJobOpts }),
  alertaCronometro: new Queue(QUEUES.ALERTA_CRONOMETRO, { connection, defaultJobOptions: defaultJobOpts }),
  limpiezaTasaCambio: new Queue(QUEUES.LIMPIEZA_TASA_CAMBIO, { connection, defaultJobOptions: defaultJobOpts }),
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
  new Worker(QUEUES.RECORDATORIOS, procesarRecordatorios, { connection, concurrency: 2 }),
  new Worker(QUEUES.LIMPIEZA_COMPROBANTES, procesarLimpiezaComprobantes, { connection, concurrency: 1 }),
  new Worker(QUEUES.MATERIALIZAR_DESCUENTOS, procesarMaterializarDescuentos, { connection, concurrency: 1 }),
  new Worker(QUEUES.ALERTA_CRONOMETRO, procesarAlertaCronometro, { connection, concurrency: 2 }),
  new Worker(QUEUES.LIMPIEZA_TASA_CAMBIO, procesarLimpiezaTasaCambio, { connection, concurrency: 1 }),
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
  // Convierte reglas de descuento activas (que el admin programó a mano en
  // /panel/descuentos) en filas de Oferta reales para los próximos días —
  // idempotente por @@unique([reglaId, inicioObjetivo]), así que cada media
  // hora alcanza sin trackear qué ya se hizo.
  await queues.materializarDescuentos.upsertJobScheduler(
    'barrido-materializar-descuentos',
    { every: 30 * 60_000 },
    { name: 'barrido' },
  );
  // Cada minuto, no cada 15-30 como los otros: es una alerta en vivo ("ya
  // se cumplió la hora, ve a recoger la pelota") — un retraso largo le
  // quita el sentido.
  await queues.alertaCronometro.upsertJobScheduler('barrido-alerta-cronometro', { every: 60_000 }, { name: 'barrido' });
  // Una vez al día alcanza — mismo criterio que la limpieza de comprobantes.
  await queues.limpiezaTasaCambio.upsertJobScheduler('barrido-limpieza-tasa-cambio', { every: 24 * 60 * 60_000 }, { name: 'barrido' });
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
  // Mismo motivo que en `queues` arriba: sin esto, un error de conexión en
  // la copia interna de Redis de este Worker tumbaba el proceso entero.
  w.on('error', (err) => console.error(`[worker ${w.name}] error de conexión — reconectando solo:`, err.message));
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
