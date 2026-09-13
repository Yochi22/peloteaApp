/**
 * Cliente server-to-server hacia el worker — SOLO se llama desde código de
 * servidor (Server Components, route handlers), nunca desde el navegador.
 * El token nunca sale del servidor de la web, así que no hay forma de que
 * alguien lo capture desde la consola del navegador o el historial de red
 * del cliente (a diferencia del viejo `/qr?token=...` público del worker).
 */

const WORKER_BASE_URL = process.env.WORKER_BASE_URL;
const TOKEN = process.env.WHATSAPP_QR_TOKEN;

function headers(): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

export interface EstadoWhatsapp {
  conectado: boolean;
  qrDisponible: boolean;
}

export async function obtenerEstadoWhatsapp(): Promise<EstadoWhatsapp | null> {
  if (!WORKER_BASE_URL || !TOKEN) return null;
  try {
    const res = await fetch(`${WORKER_BASE_URL}/whatsapp/estado`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as EstadoWhatsapp;
  } catch {
    return null;
  }
}

/** Devuelve el QR ya como data URI, listo para un <img src=...>. */
export async function obtenerQrWhatsapp(): Promise<string | null> {
  if (!WORKER_BASE_URL || !TOKEN) return null;
  try {
    const res = await fetch(`${WORKER_BASE_URL}/whatsapp/qr.png`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function reiniciarWhatsappRemoto(): Promise<boolean> {
  if (!WORKER_BASE_URL || !TOKEN) return false;
  try {
    const res = await fetch(`${WORKER_BASE_URL}/whatsapp/reiniciar`, { method: 'POST', headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}
