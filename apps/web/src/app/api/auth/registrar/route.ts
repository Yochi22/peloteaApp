import { NextResponse, type NextRequest } from 'next/server';
import { registrarSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { hashPassword, SESSION_COOKIE } from '@pelotea/security';
import { guard } from '@/lib/guard';
import { crearSesion } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const g = await guard(req, { preset: 'auth', schema: registrarSchema });
  if (!g.ok) return g.response;
  const { nombre, email, telefono, password } = g.data;

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    // Mensaje genérico: no confirmar/negar existencia de la cuenta (evita enumeración).
    return NextResponse.json(
      { error: 'no_se_pudo_registrar', message: 'No se pudo completar el registro con esos datos.' },
      { status: 400 },
    );
  }

  const hash = await hashPassword(password);
  const usuario = await prisma.usuario.create({
    data: {
      nombre,
      email,
      telefono,
      hashPassword: hash,
      rol: 'JUGADOR',
      perfil: { create: {} },
    },
  });

  const ua = req.headers.get('user-agent');
  const { token, expiraEn, maxAgeSec } = await crearSesion(usuario.id, usuario.rol, g.ip, ua);

  await prisma.auditLog.create({
    data: { actorId: usuario.id, accion: 'usuario.registrado', entidad: 'Usuario', entidadId: usuario.id, ip: g.ip },
  });

  const res = NextResponse.json({ id: usuario.id, nombre: usuario.nombre }, { status: 201 });
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
