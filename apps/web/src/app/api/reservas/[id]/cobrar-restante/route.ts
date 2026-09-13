import { NextResponse, type NextRequest } from 'next/server';
import { cobrarRestanteSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * El staff marca cobrado el resto de una reserva con pago parcial — la plata
 * en efectivo/pago móvil que se recibe EN EL MOSTRADOR al entregar la
 * pelota. El staff recibiéndola en persona es la verificación humana acá
 * (igual criterio que aprobar un comprobante: nadie confirma esto solo).
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

  const g = await guard(req, {
    preset: 'paymentReview',
    schema: cobrarRestanteSchema,
    idempotencyScope: 'cobrar-restante',
    subject: `${sesion!.usuarioId}:${reservaId}`,
  });
  if (!g.ok) return g.response;
  const { metodo, referencia } = g.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findUnique({ where: { id: reservaId } });
      if (!reserva) throw new HttpError(404, 'reserva_no_encontrada');
      if (sesion!.rol !== 'PLATAFORMA_ADMIN' && sesion!.sedeId !== reserva.sedeId) {
        throw new HttpError(403, 'sin_permiso');
      }
      if (!['CONFIRMADA', 'COMPLETADA'].includes(reserva.estado)) {
        throw new HttpError(409, `estado_invalido: ${reserva.estado}`);
      }
      if (reserva.restanteCobrado) throw new HttpError(409, 'ya_cobrado');
      if (Number(reserva.montoRestante) <= 0) throw new HttpError(409, 'sin_saldo_pendiente');

      await tx.pago.create({
        data: {
          sedeId: reserva.sedeId,
          reservaId,
          monto: reserva.montoRestante,
          metodo,
          referencia,
          estado: 'APROBADO',
          aprobadoPorId: sesion!.usuarioId,
          aprobadoEn: new Date(),
        },
      });

      const actualizada = await tx.reserva.update({
        where: { id: reservaId },
        data: { restanteCobrado: true, restanteCobradoEn: new Date(), restanteCobradoPorId: sesion!.usuarioId },
      });

      await tx.auditLog.create({
        data: {
          sedeId: reserva.sedeId,
          actorId: sesion!.usuarioId,
          accion: 'reserva.resto_cobrado',
          entidad: 'Reserva',
          entidadId: reservaId,
          despues: { monto: Number(reserva.montoRestante), metodo },
          ip: g.ip,
        },
      });

      return { ok: true, montoCobrado: Number(actualizada.montoRestante) };
    });

    await g.finish(resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/reservas/[id]/cobrar-restante', err);
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
