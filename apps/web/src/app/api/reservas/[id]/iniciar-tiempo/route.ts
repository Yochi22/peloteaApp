import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { clientIp } from '@/lib/guard';
import { redis } from '@/lib/redis';
import { getSesion, requireRol } from '@/lib/session';

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
 * El staff arranca el cronómetro cuando el cliente de verdad retira la
 * pelota — no cuando "debería" haber empezado el turno (a veces llega
 * tarde) — para poder avisar cuándo hay que recoger la pelota. Cuenta
 * `duracionMin` desde ESE instante, no desde `Reserva.inicio` (ver
 * `jobs/alerta-cronometro.ts` en el worker).
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

      const actualizada = await tx.reserva.update({
        where: { id: reservaId },
        data: { tiempoIniciadoEn: new Date(), tiempoAlertaEnviada: false },
      });

      await tx.auditLog.create({
        data: {
          sedeId: reserva.sedeId,
          actorId: sesion!.usuarioId,
          accion: 'reserva.cronometro_iniciado',
          entidad: 'Reserva',
          entidadId: reservaId,
          despues: { tiempoIniciadoEn: actualizada.tiempoIniciadoEn },
          ip: clientIp(req),
        },
      });

      return { tiempoIniciadoEn: actualizada.tiempoIniciadoEn };
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/reservas/[id]/iniciar-tiempo', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}

/** Por si el staff lo arrancó por error — lo deja como si nunca se hubiera iniciado. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const reserva = await prisma.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva) return NextResponse.json({ error: 'reserva_no_encontrada' }, { status: 404 });
  if (sesion!.rol !== 'PLATAFORMA_ADMIN' && sesion!.sedeId !== reserva.sedeId) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 });
  }

  await prisma.reserva.update({ where: { id: reservaId }, data: { tiempoIniciadoEn: null, tiempoAlertaEnviada: false } });
  return NextResponse.json({ ok: true }, { status: 200 });
}
