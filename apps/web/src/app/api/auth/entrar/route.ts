import { NextResponse, type NextRequest } from 'next/server';
import { entrarSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { verifyPassword, loginBackoffSec, SESSION_COOKIE, RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { guard, clientIp } from '@/lib/guard';
import { redis } from '@/lib/redis';
import { crearSesion } from '@/lib/session';

export const runtime = 'nodejs';

const MENSAJE_GENERICO = 'Email o contraseña incorrectos.';

export async function POST(req: NextRequest) {
  // Rate-limit por IP (guard) + por email (abajo), para no permitir credential
  // stuffing contra una sola cuenta desde muchas IPs.
  const g = await guard(req, { preset: 'auth', schema: entrarSchema });
  if (!g.ok) return g.response;
  const { email, password } = g.data;

  const rlEmail = await rateLimit(redis, `rl:auth:email:${email}`, RATE_LIMITS.auth);
  if (!rlEmail.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rlEmail) });
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  // Timing-safe-ish: SIEMPRE corremos un verify (contra un hash dummy si no
  // existe la cuenta o no tiene password) para no filtrar por tiempo de
  // respuesta si el email existe.
  const hashParaVerificar = usuario?.hashPassword ?? DUMMY_HASH;
  const verificoBien = await verifyPassword(hashParaVerificar, password);
  const passwordOk = !!usuario?.hashPassword && verificoBien;

  if (usuario?.loginBloqueadoHasta && usuario.loginBloqueadoHasta.getTime() > Date.now()) {
    return NextResponse.json(
      { error: 'cuenta_bloqueada', message: 'Demasiados intentos. Probá de nuevo más tarde.' },
      { status: 423 },
    );
  }

  if (!usuario || !passwordOk) {
    if (usuario) {
      const intentos = usuario.loginIntentosFallidos + 1;
      const backoff = loginBackoffSec(intentos);
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          loginIntentosFallidos: intentos,
          loginBloqueadoHasta: backoff > 0 ? new Date(Date.now() + backoff * 1000) : null,
        },
      });
    }
    return NextResponse.json({ error: 'credenciales_invalidas', message: MENSAJE_GENERICO }, { status: 401 });
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { loginIntentosFallidos: 0, loginBloqueadoHasta: null },
  });

  // Contraseña correcta, pero la cuenta tiene 2FA: no se crea sesión todavía
  // — se deja un desafío de un solo uso en Redis (5 min) y el cliente
  // termina el login en /api/auth/2fa/verificar con el código de la app.
  if (usuario.twoFactorEnabled) {
    const desafioId = crypto.randomUUID();
    await redis.set(`2fa:desafio:${desafioId}`, JSON.stringify({ usuarioId: usuario.id }), 'EX', 300);
    return NextResponse.json({ requiere2FA: true, desafioId }, { status: 200 });
  }

  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');
  const { token, expiraEn, maxAgeSec } = await crearSesion(usuario.id, usuario.rol, ip, ua);

  await prisma.auditLog.create({
    data: { actorId: usuario.id, accion: 'usuario.inicio_sesion', entidad: 'Usuario', entidadId: usuario.id, ip },
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

// Hash Argon2id válido de una contraseña que nadie tiene, solo para igualar el
// costo temporal del `verify` cuando el email no existe.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$Z0hFbnZKZmNPbHFXcnhpaHFJaFZmZz09';
