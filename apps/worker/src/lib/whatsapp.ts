import { rm } from 'node:fs/promises';
// Export NOMBRADO, no el default: `@whiskeysockets/baileys` es CJS
// (`exports.default = Socket_1.default` + `exports.makeWASocket = ...`) y
// este paquete corre bajo ESM real (`"type": "module"`, vía `tsx`) — el
// interop de Node para un default import de un módulo CJS entrega el
// objeto `module.exports` completo tal cual, no lo "desenvuelve" siguiendo
// `.default` (eso es un comportamiento de Babel/`esModuleInterop`, no de
// Node ESM nativo). Con el default import, `makeWASocket` terminaba siendo
// el objeto de exports entero — de ahí "makeWASocket is not a function" y
// WhatsApp nunca llegaba a conectar. El named import sí funciona: Node
// analiza el CJS con `cjs-module-lexer` y expone `exports.makeWASocket`
// como un named export real.
import { makeWASocket, useMultiFileAuthState, DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

/**
 * Cliente de WhatsApp (Baileys) — SOLO transaccional (confirmaciones, envío de
 * comprobante recibido, recordatorios, resultado de aprobación). Las ofertas
 * y descuentos NUNCA pasan por acá (ver CLAUDE.md §4) — el volumen y el tipo
 * de mensaje importan para no arriesgar el número.
 */

const SESSION_DIR = process.env.WHATSAPP_SESSION_DIR ?? './.wa-session';
const logger = pino({ level: 'warn' });

let socket: WASocket | null = null;
let conectando: Promise<WASocket> | null = null;
let qrActual: string | null = null;
let conectado = false;

/** Para el endpoint `/qr` del worker — nunca expone el socket ni las credenciales. */
export function obtenerEstadoWhatsapp(): { conectado: boolean; qr: string | null } {
  return { conectado, qr: qrActual };
}

async function conectar(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  // `printQRInTerminal` además del `/qr` propio: en local (`pnpm dev`) sigue
  // sirviendo verlo directo en la terminal sin levantar nada.
  const sock = makeWASocket({ auth: state, logger, printQRInTerminal: true });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (u.qr) qrActual = u.qr;
    if (u.connection === 'open') {
      conectado = true;
      qrActual = null;
    }
    if (u.connection === 'close') {
      const boom = u.lastDisconnect?.error as Boom | undefined;
      const debeReconectar = boom?.output?.statusCode !== DisconnectReason.loggedOut;
      socket = null;
      conectando = null;
      conectado = false;
      if (debeReconectar) {
        console.warn('WhatsApp desconectado, reintentando…');
        setTimeout(() => void obtenerSocket(), 3_000);
      } else {
        console.error('Sesión de WhatsApp cerrada (logged out). Hay que re-vincular con QR.');
        qrActual = null;
      }
    }
  });

  return sock;
}

async function obtenerSocket(): Promise<WASocket> {
  if (socket) return socket;
  if (!conectando) conectando = conectar();
  socket = await conectando;
  return socket;
}

function formatoJid(telefonoVe: string): string {
  const digits = telefonoVe.replace(/\D/g, '');
  const conCodigoPais = digits.startsWith('58') ? digits : `58${digits.replace(/^0/, '')}`;
  return `${conCodigoPais}@s.whatsapp.net`;
}

export async function enviarWhatsapp(telefono: string, mensaje: string): Promise<void> {
  const sock = await obtenerSocket();
  await sock.sendMessage(formatoJid(telefono), { text: mensaje });
}

/**
 * Conecta al arrancar el worker en vez de esperar al primer mensaje —
 * sin esto, el QR de emparejamiento nunca aparecía hasta que alguien
 * confirmara una reserva de verdad (nadie lo vería a tiempo en una demo).
 */
export async function iniciarWhatsapp(): Promise<void> {
  await obtenerSocket();
}

/**
 * Borra la sesión guardada y fuerza un QR nuevo — para cuando hay que
 * cambiar de número, la sesión quedó rota, o alguien más la vinculó por
 * error. Cierra el socket actual primero (logout real contra WhatsApp
 * cuando se puede, no solo local) para no dejar el número "medio
 * vinculado" del lado de Meta.
 */
export async function reiniciarWhatsapp(): Promise<void> {
  if (socket) {
    try {
      await socket.logout();
    } catch {
      // Si ya estaba desconectado del lado de WhatsApp, logout tira —
      // no importa, igual vamos a borrar la sesión local.
    }
  }
  socket = null;
  conectando = null;
  conectado = false;
  qrActual = null;
  await rm(SESSION_DIR, { recursive: true, force: true });
  await obtenerSocket();
}
