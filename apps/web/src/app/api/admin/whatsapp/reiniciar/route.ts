import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { reiniciarWhatsappRemoto } from '@/lib/worker';

export const runtime = 'nodejs';

/**
 * Borra la sesión de WhatsApp del worker y genera un QR nuevo. Solo
 * SEDE_ADMIN/PLATAFORMA_ADMIN — es una acción sensible (desvincula el
 * número del club) y, como cualquier acción de estos roles, exige 2FA
 * activo (ver `requireRol`).
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const g = await guard(req, {
    preset: 'mutation',
    schema: z.object({}),
    idempotencyScope: 'whatsapp-reiniciar',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;

  const ok = await reiniciarWhatsappRemoto();
  if (!ok) return NextResponse.json({ error: 'no_se_pudo_reiniciar' }, { status: 502 });

  const body = { ok: true };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}
