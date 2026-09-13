import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@pelotea/db';
import { generarSecretoTotp, uriTotp, encryptSecret } from '@pelotea/security/twofa';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security/rate-limit';
import { redis } from '@/lib/redis';
import { getSesion } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Arranca el enrolamiento de 2FA: genera un secreto nuevo, lo guarda
 * CIFRADO (todavía con `twoFactorEnabled=false` — no cuenta hasta que
 * `/confirmar` prueba que el usuario lo cargó bien en su app) y devuelve el
 * QR + el secreto en texto plano UNA vez, para que lo escanee o lo copie.
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const rl = await rateLimit(redis, `rl:auth:2fa-iniciar:${sesion.usuarioId}`, RATE_LIMITS.auth);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.error('AUTH_SECRET no configurado — no se puede cifrar el secreto 2FA.');
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.usuarioId } });
  if (!usuario || !usuario.email) {
    return NextResponse.json({ error: 'falta_email' }, { status: 422 });
  }

  const secret = generarSecretoTotp();
  const uri = uriTotp(secret, usuario.email);
  const secretBase32 = secret.base32;

  await prisma.usuario.update({
    where: { id: sesion.usuarioId },
    data: { twoFactorSecret: encryptSecret(secretBase32, authSecret), twoFactorEnabled: false },
  });

  const qrDataUrl = await QRCode.toDataURL(uri, { width: 220, margin: 1 });

  return NextResponse.json(
    { secretBase32, qrDataUrl },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
