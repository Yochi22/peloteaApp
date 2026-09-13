import { NextResponse, type NextRequest } from 'next/server';
import { cubrirCuotaSchema } from '@pelotea/shared';
import { prisma, Prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * El organizador cubre lo que un invitado no pagó — total o parcial.
 *
 * - `monto` == lo que faltaba de esa cuota → se reasigna ENTERA al
 *   organizador (el invitado ya no puede pagarla: se invalida su link).
 * - `monto` < lo que faltaba → monto personalizado: el invitado sigue
 *   debiendo el resto (su cuota se reduce) y se crea una cuota nueva, del
 *   organizador, por lo que puso de más.
 *
 * En ambos casos la cuota que queda a nombre del organizador sigue en
 * PENDIENTE — todavía tiene que subir SU comprobante y el club tiene que
 * aprobarlo, como cualquier otro pago. Esto no aprueba nada por sí solo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cuotaId: string }> },
) {
  const { id: reservaId, cuotaId } = await params;
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const g = await guard(req, {
    preset: 'mutation',
    schema: cubrirCuotaSchema,
    idempotencyScope: 'cubrir-cuota',
    subject: `${sesion.usuarioId}:${cuotaId}`,
  });
  if (!g.ok) return g.response;
  const { monto } = g.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findUnique({ where: { id: reservaId } });
      if (!reserva) throw new HttpError(404, 'reserva_no_encontrada');
      if (reserva.organizadorId !== sesion.usuarioId) throw new HttpError(403, 'sin_permiso');
      if (!['PENDIENTE_PAGO', 'COMPROBANTE_ENVIADO', 'EN_REVISION'].includes(reserva.estado)) {
        throw new HttpError(409, `estado_invalido: ${reserva.estado}`);
      }

      const cuota = await tx.cuota.findUnique({ where: { id: cuotaId } });
      if (!cuota || cuota.reservaId !== reservaId) throw new HttpError(404, 'cuota_no_encontrada');
      if (cuota.estado !== 'PENDIENTE') throw new HttpError(409, `estado_invalido: ${cuota.estado}`);
      if (cuota.participanteId === sesion.usuarioId) throw new HttpError(409, 'ya_es_tu_cuota');

      const debido = Number(cuota.monto);
      if (monto > debido + 0.01) throw new HttpError(422, 'monto_excede_lo_pendiente');

      const esCobertuaCompleta = Math.abs(monto - debido) < 0.01;

      if (esCobertuaCompleta) {
        const actualizada = await tx.cuota.update({
          where: { id: cuotaId },
          data: { participanteId: sesion.usuarioId, inviteToken: null }, // invalida el link del invitado
        });
        await tx.auditLog.create({
          data: {
            sedeId: reserva.sedeId,
            actorId: sesion.usuarioId,
            accion: 'cuota.cubierta_por_organizador',
            entidad: 'Cuota',
            entidadId: cuotaId,
            despues: { tipo: 'completa', monto: debido },
            ip: g.ip,
          },
        });
        return { cuotaCubiertaId: actualizada.id, restante: 0 };
      }

      // Monto personalizado: el invitado sigue debiendo el resto.
      await tx.cuota.update({
        where: { id: cuotaId },
        data: { monto: new Prisma.Decimal(debido - monto) },
      });
      const nueva = await tx.cuota.create({
        data: {
          reservaId,
          monto: new Prisma.Decimal(monto),
          participanteId: sesion.usuarioId,
          esOrganizador: false,
        },
      });
      await tx.auditLog.create({
        data: {
          sedeId: reserva.sedeId,
          actorId: sesion.usuarioId,
          accion: 'cuota.cubierta_por_organizador',
          entidad: 'Cuota',
          entidadId: cuotaId,
          despues: { tipo: 'parcial', monto, cuotaNuevaId: nueva.id, restanteDelInvitado: debido - monto },
          ip: g.ip,
        },
      });
      return { cuotaCubiertaId: nueva.id, restante: debido - monto };
    });

    await g.finish(resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/reservas/[id]/cuotas/[cuotaId]/cubrir', err);
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
