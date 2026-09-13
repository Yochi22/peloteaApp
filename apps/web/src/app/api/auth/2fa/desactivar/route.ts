import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { desactivar2FASchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { decryptSecret, verificarTotp } from '@pelotea/security/twofa';
import { verifyPassword } from '@pelotea/security/password';
import { getSesion } from '@/lib/session';
import { guard } from '@/lib/guard';

export const runtime = 'nodejs';

/**
 * Apaga 2FA — exige contraseña actual Y un código válido (no alcanza con
 * tener la sesión abierta: si alguien te roba la cookie, esto no le alcanza
 * para bajar tu defensa).
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const g = await guard(req, { preset: 'auth', schema: desactivar2FASchema, subject: sesion.usuarioId });
  if (!g.ok) return g.response;

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) return NextResponse.json({ error: 'error_interno' }, { status: 500 });

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.usuarioId } });
  if (!usuario?.hashPassword || !usuario.twoFactorSecret || !usuario.twoFactorEnabled) {
    return NextResponse.json({ error: 'sin_2fa_activo' }, { status: 409 });
  }

  const passwordOk = await verifyPassword(usuario.hashPassword, g.data.password);
  const secretoPlano = decryptSecret(usuario.twoFactorSecret, authSecret);
  const codigoOk = verificarTotp(secretoPlano, g.data.codigo);
  if (!passwordOk || !codigoOk) {
    return NextResponse.json({ error: 'credenciales_invalidas' }, { status: 401 });
  }

  await prisma.usuario.update({
    where: { id: sesion.usuarioId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, codigosRecuperacion2FA: [] },
  });

  return NextResponse.json({ ok: true });
}
