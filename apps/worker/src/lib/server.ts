import { createServer } from 'node:http';
import QRCode from 'qrcode';
import { obtenerEstadoWhatsapp, reiniciarWhatsapp } from './whatsapp';

/**
 * Servidor HTTP mínimo — el worker en sí no necesita exponer nada por HTTP
 * (BullMQ + Baileys hablan por Redis/websocket propios), pero:
 *  1. Render (y la mayoría de PaaS "free tier") solo ofrece Background
 *     Workers en planes pagos; un "Web Service" gratis sí alcanza, pero
 *     exige bindear un puerto y responder algo — de ahí este servidor.
 *  2. Expone el estado/QR de WhatsApp para que **la web** (nunca el
 *     navegador directo) los muestre dentro de `/panel`, protegido por la
 *     sesión + 2FA del admin — ver SECURITY.md. Antes `/qr` era una URL
 *     pública (protegida solo por un token en el query string): cualquiera
 *     con esa URL — copiada sin querer, vista en el historial del
 *     navegador, encontrada en la consola de red — podía escanear el QR y
 *     vincular SU WhatsApp en vez del número del club. Ahora estos
 *     endpoints solo los llama el servidor de la web (server-to-server, el
 *     token nunca sale al navegador del admin).
 */
export function iniciarServidorHttp(port: number): void {
  const token = process.env.WHATSAPP_QR_TOKEN;

  function autorizado(req: import('node:http').IncomingMessage): boolean {
    if (!token) return false;
    const auth = req.headers.authorization;
    return auth === `Bearer ${token}`;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'worker', ts: new Date().toISOString() }));
      return;
    }

    if (url.pathname === '/whatsapp/estado' && req.method === 'GET') {
      if (!autorizado(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_autorizado' }));
        return;
      }
      const estado = obtenerEstadoWhatsapp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conectado: estado.conectado, qrDisponible: !!estado.qr }));
      return;
    }

    if (url.pathname === '/whatsapp/qr.png' && req.method === 'GET') {
      if (!autorizado(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('no autorizado');
        return;
      }
      const estado = obtenerEstadoWhatsapp();
      if (!estado.qr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('sin QR pendiente');
        return;
      }
      const png = await QRCode.toBuffer(estado.qr, { width: 300 });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(png);
      return;
    }

    if (url.pathname === '/whatsapp/reiniciar' && req.method === 'POST') {
      if (!autorizado(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_autorizado' }));
        return;
      }
      try {
        await reiniciarWhatsapp();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_se_pudo_reiniciar', detalle: String(err) }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  server.listen(port, () => console.log(`worker: servidor HTTP en :${port} (health + WhatsApp interno)`));
}
