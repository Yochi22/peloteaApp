import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { redis } from '@/lib/redis';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/** Borra una excepción de horario — a partir de acá vuelve a poder reservarse normal esa fecha/franja. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const rl = await rateLimit(redis, `rl:mutation:${sesion!.usuarioId}`, RATE_LIMITS.mutation);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  const sede = await getSedeActiva();
  const existente = await prisma.excepcionHorario.findFirst({ where: { id, sedeId: sede.id } });
  if (!existente) return NextResponse.json({ error: 'excepcion_no_encontrada' }, { status: 404 });

  await prisma.excepcionHorario.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'excepcion_horario.borrada',
      entidad: 'ExcepcionHorario',
      entidadId: id,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
