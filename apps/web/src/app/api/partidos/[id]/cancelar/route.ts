import { NextResponse, type NextRequest } from 'next/server';
import { PLANTILLAS_NOTIFICACION } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { redis } from '@/lib/redis';
import { getSesion } from '@/lib/session';

export const runtime = 'nodejs';

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/**
 * El organizador cancela su propio partido comunitario a propósito — antes
 * la única salida era esperar a que expirara solo por hora
 * (`jobs/expirar-partidos.ts`), lo que dejaba a los que ya se habían unido
 * esperando algo que el organizador ya sabía que no iba a pasar. Solo tiene
 * sentido mientras nadie pagó nada todavía: si ya hay una `Reserva`
 * `CONFIRMADA` (o en camino, `esDividida` con cuotas ya aprobándose) ligada
 * al partido, cancelar acá dejaría plata pagada sin reserva — en ese punto
 * hay que cancelar la reserva (`/api/reservas/[id]/cancelar`), no el
 * partido.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: partidoId } = await params;
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const rl = await rateLimit(redis, `rl:mutation:${sesion.usuarioId}`, RATE_LIMITS.mutation);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const partido = await tx.partidoAbierto.findUnique({
        where: { id: partidoId },
        include: { participantes: true, reserva: true },
      });
      if (!partido) throw new HttpError(404, 'partido_no_encontrado');
      if (partido.organizadorId !== sesion.usuarioId) throw new HttpError(403, 'solo_el_organizador_puede_cancelar');
      if (!['ABIERTO', 'COMPLETO'].includes(partido.estado)) throw new HttpError(409, 'partido_ya_no_se_puede_cancelar');
      if (partido.reserva && !['CANCELADA', 'EXPIRADA'].includes(partido.reserva.estado)) {
        throw new HttpError(409, 'ya_tiene_reserva');
      }

      await tx.partidoAbierto.update({ where: { id: partidoId }, data: { estado: 'CANCELADO' } });

      const otros = partido.participantes.filter((p) => p.usuarioId !== partido.organizadorId && p.estado === 'UNIDO');
      if (otros.length > 0) {
        await tx.notificacion.createMany({
          data: otros.map((p) => ({
            usuarioId: p.usuarioId,
            canal: 'IN_APP' as const,
            plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_CANCELADO,
            payload: { partidoId },
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          sedeId: partido.sedeId,
          actorId: sesion.usuarioId,
          accion: 'partido.cancelado',
          entidad: 'PartidoAbierto',
          entidadId: partidoId,
        },
      });

      return { ok: true };
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/partidos/[id]/cancelar', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
