import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verificar2FASchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { decryptSecret, verificarTotp, hashCodigoRecuperacion } from '@pelotea/security/twofa';
import { SESSION_COOKIE } from '@pelotea/security/session';
import { RATE_LIMITS, rateLimit } from '@pelotea/security/rate-limit';
import { redis } from '@/lib/redis';
import { guard, clientIp } from '@/lib/guard';
import { crearSesion } from '@/lib/session';

export const runtime = 'nodejs';

/** Ver DESAFIO_PREFIJO en entrar/route.ts — mismo valor en los dos archivos. */
const DESAFIO_PREFIJO = '2fa:desafio:';

/**
 * Segundo paso del login cuando la cuenta tiene 2FA: `/api/auth/entrar` ya
 * validó la contraseña y dejó un `desafioId` de un solo uso en Redis (5 min).
 * Acá se valida el código de 6 dígitos — o, si el usuario perdió el
 * dispositivo, uno de sus códigos de recuperación (cada uno sirve una vez).
 * Recién con eso se crea la sesión de verdad.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, { preset: 'auth', schema: verificar2FASchema });
  if (!g.ok) return g.response;
  const { desafioId, codigo } = g.data;

  const claveDesafio = `${DESAFIO_PREFIJO}${desafioId}`;
  const crudo = await redis.get(claveDesafio);
  if (!crudo) return NextResponse.json({ error: 'desafio_invalido_o_vencido' }, { status: 401 });
  const { usuarioId } = JSON.parse(crudo) as { usuarioId: string };

  // Rate-limit por desafío (no por IP): un atacante con la cookie del
  // desafío no puede fuerza-bruta el código de 6 dígitos sin toparse esto.
  const rl = await rateLimit(redis, `rl:auth:2fa-verificar:${desafioId}`, RATE_LIMITS.auth);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const authSecret = process.env.AUTH_SECRET;
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!authSecret || !usuario?.twoFactorSecret) {
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }

  const secretoPlano = decryptSecret(usuario.twoFactorSecret, authSecret);
  let valido = verificarTotp(secretoPlano, codigo);

  if (!valido) {
    // ¿Es un código de recuperación válido y todavía no usado?
    const hash = hashCodigoRecuperacion(codigo);
    if (usuario.codigosRecuperacion2FA.includes(hash)) {
      valido = true;
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { codigosRecuperacion2FA: usuario.codigosRecuperacion2FA.filter((c) => c !== hash) },
      });
    }
  }

  if (!valido) return NextResponse.json({ error: 'codigo_invalido' }, { status: 401 });

  await redis.del(claveDesafio); // de un solo uso, sea cual sea el resultado

  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');
  const { token, expiraEn, maxAgeSec } = await crearSesion(usuario.id, usuario.rol, ip, ua);

  await prisma.auditLog.create({
    data: { actorId: usuario.id, accion: 'usuario.inicio_sesion_2fa', entidad: 'Usuario', entidadId: usuario.id, ip },
  });

  const res = NextResponse.json({ id: usuario.id, rol: usuario.rol }, { status: 200 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiraEn,
    maxAge: maxAgeSec,
  });
  return res;
}
