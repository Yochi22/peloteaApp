import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { transicionar, PENALIZACION_NO_SHOW } from '@pelotea/shared';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security/rate-limit';
import { redis } from '@/lib/redis';
import { getSesion, requireRol } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * El staff marca que nadie se presentó a una reserva CONFIRMADA. Penaliza la
 * reputación del organizador — si tiene cuenta y perfil de jugador (un
 * invitado sin cuenta no tiene nada que penalizar, pero la reserva igual
 * queda registrada como NO_SHOW para las métricas del club).
 * Solo tiene sentido después de que empezó el turno — no se puede marcar un
 * no-show de algo que todavía no pasó.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: reservaId } = await params;
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const rl = await rateLimit(redis, `rl:paymentReview:${sesion!.usuarioId}`, RATE_LIMITS.paymentReview);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findUnique({ where: { id: reservaId } });
      if (!reserva) throw new HttpError(404, 'reserva_no_encontrada');
      if (sesion!.rol !== 'PLATAFORMA_ADMIN' && sesion!.sedeId !== reserva.sedeId) {
        throw new HttpError(403, 'sin_permiso');
      }
      if (reserva.estado !== 'CONFIRMADA') throw new HttpError(409, `estado_invalido: ${reserva.estado}`);
      if (reserva.inicio > new Date()) throw new HttpError(409, 'turno_no_ha_empezado');

      const actualizada = await tx.reserva.update({
        where: { id: reservaId },
        data: { estado: transicionar(reserva.estado, 'MARCAR_NO_SHOW') },
      });

      const perfil = await tx.perfilJugador.findUnique({ where: { usuarioId: reserva.organizadorId } });
      if (perfil) {
        await tx.perfilJugador.update({
          where: { usuarioId: reserva.organizadorId },
          data: {
            noShowCount: { increment: 1 },
            reputacion: Math.max(0, perfil.reputacion - PENALIZACION_NO_SHOW),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          sedeId: reserva.sedeId,
          actorId: sesion!.usuarioId,
          accion: 'reserva.no_show',
          entidad: 'Reserva',
          entidadId: reservaId,
          despues: { organizadorId: reserva.organizadorId },
        },
      });

      return { estado: actualizada.estado };
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/reservas/[id]/marcar-no-show', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
