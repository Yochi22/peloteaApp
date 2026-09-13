import { NextResponse, type NextRequest } from 'next/server';
import { completarCuentaSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { hashPassword, SESSION_COOKIE } from '@pelotea/security';
import { guard } from '@/lib/guard';
import { crearSesion } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Convierte una reserva de invitado en una cuenta real: el invitado ya existe
 * como Usuario (creado al reservar) — acá solo agrega contraseña (y email, si
 * no lo dio antes) y gana perfil de jugador, es decir, acceso a ofertas de
 * última hora, descuentos, dividir pagos y partidos abiertos desde ya.
 * La prueba de identidad es el `accessToken` de su propia reserva.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, { preset: 'auth', schema: completarCuentaSchema });
  if (!g.ok) return g.response;
  const { reservaId, token, password, email } = g.data;

  const reserva = await prisma.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva || !reserva.accessToken || reserva.accessToken !== token) {
    return NextResponse.json({ error: 'no_autorizado' }, { status: 403 });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: reserva.organizadorId } });
  if (!usuario || !usuario.esInvitado || usuario.hashPassword) {
    // Ya tiene cuenta (o esto no es una reserva de invitado) — nada que completar.
    return NextResponse.json({ error: 'no_aplica' }, { status: 409 });
  }

  const emailFinal = usuario.email ?? email ?? null;
  if (!emailFinal) {
    return NextResponse.json({ error: 'falta_email', message: 'Necesitamos un email para tu cuenta.' }, { status: 422 });
  }
  if (!usuario.email && email) {
    const enUso = await prisma.usuario.findUnique({ where: { email } });
    if (enUso) return NextResponse.json({ error: 'email_en_uso' }, { status: 409 });
  }

  const hash = await hashPassword(password);
  const actualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      email: emailFinal,
      hashPassword: hash,
      esInvitado: false,
      perfil: { create: {} },
    },
  });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = req.headers.get('user-agent');
  const { token: sessionToken, expiraEn, maxAgeSec } = await crearSesion(actualizado.id, actualizado.rol, ip, ua);

  await prisma.auditLog.create({
    data: { actorId: actualizado.id, accion: 'usuario.cuenta_completada', entidad: 'Usuario', entidadId: actualizado.id, ip },
  });

  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiraEn,
    maxAge: maxAgeSec,
  });
  return res;
}
