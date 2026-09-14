import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { resolverCuotaSchema, transicionarCuota, confirmarDirectamente, splitCompleto, PLANTILLAS_NOTIFICACION } from '@pelotea/shared';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Aprueba/rechaza la cuota de un participante del split. Cuando TODAS las
 * cuotas de la reserva quedan APROBADA, la reserva pasa a CONFIRMADA.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: cuotaId } = await params;
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const g = await guard(req, {
    preset: 'paymentReview',
    schema: resolverCuotaSchema,
    idempotencyScope: 'resolver-cuota',
    subject: `${sesion!.usuarioId}:${cuotaId}`,
  });
  if (!g.ok) return g.response;
  const { decision, motivoRechazo } = g.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const cuota = await tx.cuota.findUnique({ where: { id: cuotaId }, include: { reserva: true, pago: true } });
      if (!cuota) throw new HttpError(404, 'cuota_no_encontrada');
      if (sesion!.rol !== 'PLATAFORMA_ADMIN' && sesion!.sedeId !== cuota.reserva.sedeId) {
        throw new HttpError(403, 'sin_permiso');
      }
      if (cuota.estado !== 'PAGADA') throw new HttpError(409, `estado_invalido: ${cuota.estado}`);

      if (cuota.pago) {
        await tx.pago.update({
          where: { id: cuota.pago.id },
          data: {
            estado: decision === 'APROBAR' ? 'APROBADO' : 'RECHAZADO',
            aprobadoPorId: sesion!.usuarioId,
            aprobadoEn: new Date(),
            motivoRechazo: decision === 'RECHAZAR' ? motivoRechazo : undefined,
          },
        });
      }

      const nuevoEstadoCuota = decision === 'APROBAR' ? 'APROBADA' : 'PENDIENTE';
      await tx.cuota.update({
        where: { id: cuotaId },
        data: { estado: transicionarCuota('PAGADA', nuevoEstadoCuota) },
      });

      await tx.auditLog.create({
        data: {
          sedeId: cuota.reserva.sedeId,
          actorId: sesion!.usuarioId,
          accion: decision === 'APROBAR' ? 'cuota.aprobada' : 'cuota.rechazada',
          entidad: 'Cuota',
          entidadId: cuotaId,
          despues: { motivoRechazo },
          ip: g.ip,
        },
      });

      if (decision !== 'APROBAR') return { estadoCuota: nuevoEstadoCuota, reservaConfirmada: false };

      const cuotas = await tx.cuota.findMany({ where: { reservaId: cuota.reservaId } });
      if (splitCompleto(cuotas) && cuota.reserva.estado !== 'CONFIRMADA') {
        const reserva = await tx.reserva.update({
          where: { id: cuota.reservaId },
          data: { estado: confirmarDirectamente(cuota.reserva.estado), confirmadaEn: new Date() },
        });
        await tx.slotLock.updateMany({ where: { reservaId: reserva.id }, data: { expiraEn: reserva.fin } });
        await tx.notificacion.create({
          data: {
            usuarioId: reserva.organizadorId,
            canal: 'WHATSAPP',
            plantilla: PLANTILLAS_NOTIFICACION.SPLIT_COMPLETO,
            payload: { reservaId: reserva.id },
          },
        });

        // Split de un partido comunitario: mismo criterio que la
        // aprobación directa de pago único — el partido pasa a CONFIRMADO
        // recién cuando la reserva de verdad se confirma.
        if (reserva.partidoAbiertoId) {
          await tx.partidoAbierto.update({ where: { id: reserva.partidoAbiertoId }, data: { estado: 'CONFIRMADO' } });
          const participantes = await tx.participantePartido.findMany({
            where: { partidoId: reserva.partidoAbiertoId, usuarioId: { not: reserva.organizadorId } },
            select: { usuarioId: true },
          });
          if (participantes.length > 0) {
            await tx.notificacion.createMany({
              data: participantes.map((p) => ({
                usuarioId: p.usuarioId,
                canal: 'WHATSAPP' as const,
                plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_CONFIRMADO,
                payload: { partidoId: reserva.partidoAbiertoId, reservaId: reserva.id },
              })),
            });
          }
        }

        return { estadoCuota: nuevoEstadoCuota, reservaConfirmada: true };
      }
      return { estadoCuota: nuevoEstadoCuota, reservaConfirmada: false };
    });

    await g.finish(resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/cuotas/[id]/resolver', err);
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
