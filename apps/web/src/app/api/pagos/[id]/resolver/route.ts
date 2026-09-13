import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { resolverPagoSchema, transicionar, PLANTILLAS_NOTIFICACION } from '@pelotea/shared';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Aprueba/rechaza un pago pendiente. Solo SEDE_STAFF/SEDE_ADMIN de la sede del
 * pago, o PLATAFORMA_ADMIN. Aprobar confirma la reserva; rechazar la devuelve a
 * PENDIENTE_PAGO con un nuevo HOLD para que el usuario reintente.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pagoId } = await params;
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const g = await guard(req, {
    preset: 'paymentReview',
    schema: resolverPagoSchema.omit({ pagoId: true }),
    idempotencyScope: 'resolver-pago',
    subject: `${sesion!.usuarioId}:${pagoId}`,
  });
  if (!g.ok) return g.response;
  const { decision, motivoRechazo } = g.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const pago = await tx.pago.findUnique({ where: { id: pagoId }, include: { reserva: true } });
      if (!pago || !pago.reserva) throw new HttpError(404, 'pago_no_encontrado');

      if (sesion!.rol !== 'PLATAFORMA_ADMIN' && sesion!.sedeId !== pago.sedeId) {
        throw new HttpError(403, 'sin_permiso');
      }
      if (pago.estado !== 'EN_REVISION' && pago.estado !== 'PENDIENTE') {
        throw new HttpError(409, `pago_ya_resuelto: ${pago.estado}`);
      }
      if (pago.reserva.estado !== 'COMPROBANTE_ENVIADO' && pago.reserva.estado !== 'EN_REVISION') {
        throw new HttpError(409, `reserva_estado_invalido: ${pago.reserva.estado}`);
      }

      const sede = await tx.sede.findUniqueOrThrow({ where: { id: pago.sedeId } });

      if (decision === 'APROBAR') {
        await tx.pago.update({
          where: { id: pagoId },
          data: { estado: 'APROBADO', aprobadoPorId: sesion!.usuarioId, aprobadoEn: new Date() },
        });
        const reserva = await tx.reserva.update({
          where: { id: pago.reserva.id },
          data: { estado: transicionar(pago.reserva.estado, 'APROBAR'), confirmadaEn: new Date() },
        });
        // El lock se sostiene hasta que termine el turno.
        await tx.slotLock.updateMany({ where: { reservaId: reserva.id }, data: { expiraEn: reserva.fin } });
        await tx.notificacion.create({
          data: {
            usuarioId: reserva.organizadorId,
            canal: 'WHATSAPP',
            plantilla: PLANTILLAS_NOTIFICACION.RESERVA_CONFIRMADA,
            payload: { reservaId: reserva.id },
          },
        });
        await tx.auditLog.create({
          data: {
            sedeId: pago.sedeId,
            actorId: sesion!.usuarioId,
            accion: 'pago.aprobado',
            entidad: 'Pago',
            entidadId: pagoId,
            despues: { reservaId: reserva.id },
            ip: g.ip,
          },
        });
        return { estado: reserva.estado };
      }

      // RECHAZAR
      await tx.pago.update({
        where: { id: pagoId },
        data: { estado: 'RECHAZADO', aprobadoPorId: sesion!.usuarioId, aprobadoEn: new Date(), motivoRechazo },
      });
      const nuevoHold = new Date(Date.now() + sede.holdMinutos * 60_000);
      const reserva = await tx.reserva.update({
        where: { id: pago.reserva.id },
        data: { estado: transicionar(pago.reserva.estado, 'RECHAZAR'), holdExpiraEn: nuevoHold },
      });
      await tx.slotLock.updateMany({ where: { reservaId: reserva.id }, data: { expiraEn: nuevoHold } });
      await tx.notificacion.create({
        data: {
          usuarioId: reserva.organizadorId,
          canal: 'WHATSAPP',
          plantilla: PLANTILLAS_NOTIFICACION.RESERVA_RECHAZADA,
          payload: { reservaId: reserva.id, motivo: motivoRechazo },
        },
      });
      await tx.auditLog.create({
        data: {
          sedeId: pago.sedeId,
          actorId: sesion!.usuarioId,
          accion: 'pago.rechazado',
          entidad: 'Pago',
          entidadId: pagoId,
          despues: { reservaId: reserva.id, motivoRechazo },
          ip: g.ip,
        },
      });
      return { estado: reserva.estado };
    });

    await g.finish(resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/pagos/[id]/resolver', err);
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
