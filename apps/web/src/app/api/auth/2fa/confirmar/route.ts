import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { confirmar2FASchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { decryptSecret, verificarTotp, generarCodigosRecuperacion, hashCodigoRecuperacion } from '@pelotea/security/twofa';
import { getSesion } from '@/lib/session';
import { guard } from '@/lib/guard';

export const runtime = 'nodejs';

/**
 * Prueba que el código de la app de autenticación coincide con el secreto
 * que se generó en `/iniciar` — recién ahí `twoFactorEnabled` pasa a true.
 * Devuelve los códigos de recuperación EN TEXTO PLANO una sola vez (se
 * guardan hasheados, como una contraseña) — si se pierden, no se pueden
 * volver a mostrar, solo regenerar (lo que invalida los anteriores).
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const g = await guard(req, {
    preset: 'auth',
    schema: confirmar2FASchema,
    idempotencyScope: 'confirmar-2fa',
    subject: sesion.usuarioId,
  });
  if (!g.ok) return g.response;

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) return NextResponse.json({ error: 'error_interno' }, { status: 500 });

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.usuarioId } });
  if (!usuario?.twoFactorSecret) {
    return NextResponse.json({ error: 'sin_enrolamiento_pendiente' }, { status: 409 });
  }

  const secretoPlano = decryptSecret(usuario.twoFactorSecret, authSecret);
  if (!verificarTotp(secretoPlano, g.data.codigo)) {
    return NextResponse.json({ error: 'codigo_invalido' }, { status: 401 });
  }

  const codigos = generarCodigosRecuperacion();
  await prisma.usuario.update({
    where: { id: sesion.usuarioId },
    data: { twoFactorEnabled: true, codigosRecuperacion2FA: codigos.map(hashCodigoRecuperacion) },
  });

  const body = { ok: true, codigosRecuperacion: codigos };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}
