import { createServer } from 'node:http';

/**
 * Servidor HTTP mínimo — el worker en sí no necesita exponer nada por HTTP
 * (BullMQ habla por Redis), pero Render (y la mayoría de PaaS "free tier")
 * solo ofrece Background Workers en planes pagos; un "Web Service" gratis sí
 * alcanza, pero exige bindear un puerto y responder algo — de ahí este
 * servidor mínimo, solo para eso.
 */
export function iniciarServidorHttp(port: number): void {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'worker', ts: new Date().toISOString() }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  server.listen(port, () => console.log(`worker: servidor HTTP en :${port} (health)`));
}
