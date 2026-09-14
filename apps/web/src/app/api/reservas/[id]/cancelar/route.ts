import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { cancelarReservaSchema, transicionar, debeGenerarLastMinute, PLANTILLAS_NOTIFICACION } from '@pelotea/shared';
import { guard } from '@/lib/guard';
import { getSesion } from '@/lib/session';
import { puedeAccederReserva } from '@/lib/acceso-reserva';

export const runtime = 'nodejs';

/** Descuento por defecto de una oferta last-minute generada automáticamente. */
const DESCUENTO_LAST_MINUTE_PCT = 20;

/**
 * Cancela una reserva (dueño de la reserva, o staff/admin de la sede).
 * Si estaba CONFIRMADA y cae dentro de la ventana crítica de la sede, genera
 * una Oferta LAST_MINUTE — el worker la despacha por Web Push/email (nunca
 * WhatsApp).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: reservaId } = await params;
  const sesion = await getSesion(req);
  const tokenQuery = new URL(req.url).searchParams.get('token');

  const g = await guard(req, {
    preset: 'mutation',
    schema: cancelarReservaSchema,
    idempotencyScope: 'cancelar-reserva',
    subject: sesion?.usuarioId,
  });
  if (!g.ok) return g.response;
  const { motivo } = g.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findUnique({ where: { id: reservaId } });
      if (!reserva) throw new HttpError(404, 'reserva_no_encontrada');

      const esStaffDeLaSede =
        !!sesion &&
        (sesion.rol === 'SEDE_ADMIN' || sesion.rol === 'SEDE_STAFF') &&
        sesion.sedeId === reserva.sedeId;
      const esPlataforma = sesion?.rol === 'PLATAFORMA_ADMIN';
      const autorizado = puedeAccederReserva(sesion, reserva, tokenQuery) || esStaffDeLaSede || esPlataforma;
      if (!autorizado) throw new HttpError(403, 'sin_permiso');

      if (!['PENDIENTE_PAGO', 'COMPROBANTE_ENVIADO', 'EN_REVISION', 'CONFIRMADA'].includes(reserva.estado)) {
        throw new HttpError(409, `estado_invalido: ${reserva.estado}`);
      }

      const estadoAnterior = reserva.estado;
      const cancelada = await tx.reserva.update({
        where: { id: reservaId },
        data: {
          estado: transicionar(reserva.estado, 'CANCELAR'),
          canceladaEn: new Date(),
          canceladaPorId: sesion?.usuarioId ?? reserva.organizadorId,
          motivoCancelacion: motivo,
        },
      });
      await tx.slotLock.deleteMany({ where: { reservaId } });

      // ── Huecos que esto tapa ──────────────────────────────────────────
      // 1) Un comprobante EN_REVISION de una reserva que se acaba de cancelar
      //    se quedaba flotando en la cola de aprobación del panel — staff
      //    podía aprobar por error un pago de algo que ya no existe. Se
      //    rechaza junto con la reserva/cuotas.
      await tx.pago.updateMany({
        where: { reservaId, estado: 'EN_REVISION' },
        data: { estado: 'RECHAZADO', motivoRechazo: 'Reserva cancelada', aprobadoEn: new Date() },
      });
      await tx.pago.updateMany({
        where: { cuota: { reservaId }, estado: 'EN_REVISION' },
        data: { estado: 'RECHAZADO', motivoRechazo: 'Reserva cancelada', aprobadoEn: new Date() },
      });
      await tx.cuota.updateMany({
        where: { reservaId, estado: { in: ['PENDIENTE', 'PAGADA'] } },
        data: { estado: 'VENCIDA' },
      });

      // Política del negocio: el abono NO se devuelve si quien cancela es el
      // propio cliente (jugador o invitado) — pagar 1 hora y cancelar
      // significa perder esa hora. Si cancela EL CLUB (staff/admin/
      // plataforma), la culpa no es del cliente y el club puede devolver el
      // abono — pero como todo el dinero de este proyecto es manual
      // (CLAUDE.md §5), esa devolución la hace el club por fuera del sistema
      // (efectivo, pago móvil de vuelta); acá no hay nada que acreditar.

      let ofertaId: string | null = null;
      if (estadoAnterior === 'CONFIRMADA') {
        const sede = await tx.sede.findUniqueOrThrow({ where: { id: reserva.sedeId } });
        if (debeGenerarLastMinute(reserva.inicio, new Date(), sede.cancelacionHoras)) {
          const precioFinal = Number(
            (Number(reserva.precioTotal) * (1 - DESCUENTO_LAST_MINUTE_PCT / 100)).toFixed(2),
          );
          const oferta = await tx.oferta.create({
            data: {
              sedeId: reserva.sedeId,
              canchaId: reserva.canchaId,
              tipo: 'LAST_MINUTE',
              inicioObjetivo: reserva.inicio,
              finObjetivo: reserva.fin,
              descuentoPct: DESCUENTO_LAST_MINUTE_PCT,
              precioFinal,
              ventanaInicio: new Date(),
              ventanaFin: reserva.inicio,
              cupo: 1,
              reservaOrigenId: reserva.id,
              filtros: { soloOptIn: true },
            },
          });
          ofertaId = oferta.id;
        }
      }

      // Avisar al organizador — antes cancelar no avisaba a NADIE, ni
      // siquiera cuando el club cancelaba la reserva de otra persona.
      const porElClub = esStaffDeLaSede || esPlataforma;
      const payloadNotificacion = { reservaId, motivo: motivo ?? null, porElClub };
      await tx.notificacion.createMany({
        data: [
          { usuarioId: reserva.organizadorId, canal: 'WHATSAPP', plantilla: PLANTILLAS_NOTIFICACION.RESERVA_CANCELADA, payload: payloadNotificacion },
          { usuarioId: reserva.organizadorId, canal: 'IN_APP', plantilla: PLANTILLAS_NOTIFICACION.RESERVA_CANCELADA, payload: payloadNotificacion },
        ],
      });

      // Partido comunitario: si su reserva se cancela (rechazo definitivo,
      // el hold venció, o el club/organizador la cancela), el partido
      // vuelve a COMPLETO — el grupo sigue armado, solo hay que confirmar
      // de nuevo (buscará otra cancha del pool si esta ya no calza).
      if (reserva.partidoAbiertoId) {
        await tx.partidoAbierto.update({ where: { id: reserva.partidoAbiertoId }, data: { estado: 'COMPLETO' } });
        await tx.notificacion.create({
          data: {
            usuarioId: reserva.organizadorId,
            canal: 'IN_APP',
            plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_COMPLETO,
            payload: { partidoId: reserva.partidoAbiertoId },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          sedeId: reserva.sedeId,
          actorId: sesion?.usuarioId ?? reserva.organizadorId,
          accion: 'reserva.cancelada',
          entidad: 'Reserva',
          entidadId: reservaId,
          antes: { estado: estadoAnterior },
          despues: { estado: cancelada.estado, motivo, ofertaId },
          ip: g.ip,
        },
      });

      return { estado: cancelada.estado, ofertaId };
    });

    await g.finish(resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/reservas/[id]/cancelar', err);
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
