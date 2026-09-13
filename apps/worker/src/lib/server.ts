import { createServer } from 'node:http';
import QRCode from 'qrcode';
import { obtenerEstadoWhatsapp } from './whatsapp';

/**
 * Servidor HTTP mínimo — el worker en sí no necesita exponer nada por HTTP
 * (BullMQ + Baileys hablan por Redis/websocket propios), pero:
 *  1. Render (y la mayoría de PaaS "free tier") solo ofrece Background
 *     Workers en planes pagos; un "Web Service" gratis sí alcanza, pero
 *     exige bindear un puerto y responder algo — de ahí este servidor.
 *  2. Sirve el QR de emparejamiento de WhatsApp como imagen (`/qr`) en vez
 *     de depender de leer el ASCII de `printQRInTerminal` en los logs del
 *     hosting, que es incómodo/frágil de escanear.
 *
 * `/qr` exige `WHATSAPP_QR_TOKEN` por query param — sin esto, cualquiera que
 * encuentre la URL pública del worker durante la ventana de emparejamiento
 * podría escanear el QR y vincular SU WhatsApp en vez del número del club.
 */
export function iniciarServidorHttp(port: number): void {
  const qrToken = process.env.WHATSAPP_QR_TOKEN;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'worker', ts: new Date().toISOString() }));
      return;
    }

    if (url.pathname === '/qr') {
      if (!qrToken) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Falta configurar WHATSAPP_QR_TOKEN en el entorno — no se puede exponer el QR sin protegerlo.');
        return;
      }
      if (url.searchParams.get('token') !== qrToken) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Token inválido.');
        return;
      }

      const estado = obtenerEstadoWhatsapp();
      if (estado.conectado) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('WhatsApp ya está vinculado — no hay QR pendiente.');
        return;
      }
      if (!estado.qr) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Sin QR pendiente todavía — espera unos segundos y recarga.');
        return;
      }

      const png = await QRCode.toBuffer(estado.qr, { width: 300 });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(png);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  server.listen(port, () => console.log(`worker: servidor HTTP en :${port} (health + QR de WhatsApp)`));
}
