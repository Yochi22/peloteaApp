import { NextResponse, type NextRequest } from 'next/server';
import { unirsePartidoSchema, transicionar, dividirEnCuotas } from '@pelotea/shared';
import { prisma, Prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
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
 * Une al usuario a un partido abierto. Seguro ante condición de carrera: el
 * incremento de `cuposLlenos` es un UPDATE condicionado (`WHERE cuposLlenos <
 * cuposTotales`) — si dos personas se unen al mismo tiempo para el último
 * cupo, solo una gana; la otra recibe `partido_completo`.
 *
 * Cuando el partido se llena y ya tiene cancha asignada, se intenta reservar
 * y dividir el pago automáticamente entre los participantes — en una
 * transacción SEPARADA, después de confirmar la unión: si alguien más tomó
 * ese turno mientras tanto, la unión al partido queda firme igual (el cupo ya
 * es de esa persona) y solo el auto-booking se cancela — el club puede
 * reservarla a mano.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: partidoId } = await params;
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const g = await guard(req, {
    preset: 'mutation',
    schema: unirsePartidoSchema,
    idempotencyScope: 'unirse-partido',
    subject: `${sesion.usuarioId}:${partidoId}`,
  });
  if (!g.ok) return g.response;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const partido = await tx.partidoAbierto.findUnique({ where: { id: partidoId } });
      if (!partido) throw new HttpError(404, 'partido_no_encontrado');
      if (partido.estado !== 'ABIERTO') throw new HttpError(409, 'partido_no_disponible');

      const yaParticipa = await tx.participantePartido.findUnique({
        where: { partidoId_usuarioId: { partidoId, usuarioId: sesion.usuarioId } },
      });
      if (yaParticipa) throw new HttpError(409, 'ya_estas_en_este_partido');

      const upd = await tx.partidoAbierto.updateMany({
        where: { id: partidoId, cuposLlenos: { lt: partido.cuposTotales }, estado: 'ABIERTO' },
        data: { cuposLlenos: { increment: 1 } },
      });
      if (upd.count === 0) throw new HttpError(409, 'partido_completo');

      await tx.participantePartido.create({ data: { partidoId, usuarioId: sesion.usuarioId, estado: 'UNIDO' } });

      const actualizado = await tx.partidoAbierto.findUniqueOrThrow({ where: { id: partidoId } });
      const seCompleto = actualizado.cuposLlenos >= actualizado.cuposTotales;
      if (seCompleto) {
        await tx.partidoAbierto.update({ where: { id: partidoId }, data: { estado: 'COMPLETO' } });
      }

      await tx.auditLog.create({
        data: {
          sedeId: partido.sedeId,
          actorId: sesion.usuarioId,
          accion: 'partido.union',
          entidad: 'PartidoAbierto',
          entidadId: partidoId,
          ip: g.ip,
        },
      });

      return { cuposLlenos: actualizado.cuposLlenos, completo: seCompleto, canchaId: actualizado.canchaId };
    });

    await g.finish(resultado);

    let reservaId: string | null = null;
    if (resultado.completo && resultado.canchaId) {
      reservaId = await autoReservarPartido(partidoId).catch((err) => {
        console.error(`auto-booking del partido ${partidoId} falló (se deja para reservar a mano):`, err);
        return null;
      });
    }

    return NextResponse.json({ ...resultado, reservaId }, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/partidos/[id]/unirse', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}

/**
 * Reserva la cancha del partido y divide `precioPorJugador × cupos` entre
 * los participantes (cuotas sin cuenta — igual que un split armado a mano).
 * Transacción propia: si el turno ya no está libre, no se toca la unión al
 * partido, solo se deja sin reserva automática.
 */
async function autoReservarPartido(partidoId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const partido = await tx.partidoAbierto.findUnique({
      where: { id: partidoId },
      include: { participantes: { orderBy: { createdAt: 'asc' } }, reserva: true },
    });
    if (!partido || !partido.canchaId || partido.reserva) return null;

    const cancha = await tx.cancha.findUnique({ where: { id: partido.canchaId } });
    if (!cancha) return null;

    const duracionMin = Math.round((partido.fin.getTime() - partido.inicio.getTime()) / 60_000);
    if (duracionMin % cancha.duracionTurnoMin !== 0 || duracionMin < cancha.duracionTurnoMin || duracionMin > cancha.duracionMaximaMin) {
      return null; // duración inválida para esta cancha: que lo reserve el club a mano
    }
    const unidades = duracionMin / cancha.duracionTurnoMin;
    const inicios = Array.from({ length: unidades }, (_, u) => new Date(partido.inicio.getTime() + u * cancha.duracionTurnoMin * 60_000));

    const total = Number(partido.precioPorJugador) * partido.cuposTotales;

    const reserva = await tx.reserva.create({
      data: {
        sedeId: partido.sedeId,
        canchaId: partido.canchaId,
        organizadorId: partido.organizadorId,
        inicio: partido.inicio,
        fin: partido.fin,
        estado: transicionar('BORRADOR', 'INICIAR_PAGO'),
        canal: 'PARTIDO_ABIERTO',
        precioTotal: new Prisma.Decimal(total),
        // El precio de un partido abierto lo fija el organizador directo en Bs
        // (no es la tarifa oficial de la cancha) — sin conversión de moneda.
        precioTotalRef: new Prisma.Decimal(total),
        monedaRef: 'VES',
        tasaCambio: new Prisma.Decimal(1),
        // El split ya cubre el 100% entre las cuotas — sin pago parcial acá.
        montoAbono: new Prisma.Decimal(total),
        montoRestante: new Prisma.Decimal(0),
        esDividida: true,
        partidoAbiertoId: partido.id,
        holdExpiraEn: new Date(Date.now() + 30 * 60_000), // más margen: ya son varias personas coordinando
      },
    });

    // Si alguien más tomó ese turno entre que se llenó el partido y este
    // momento, esto tira P2002 y la función entera se revierte (queda null).
    await tx.slotLock.createMany({
      data: inicios.map((inicioUnidad) => ({
        sedeId: partido.sedeId,
        canchaId: partido.canchaId!,
        inicio: inicioUnidad,
        fin: new Date(inicioUnidad.getTime() + cancha.duracionTurnoMin * 60_000),
        reservaId: reserva.id,
        expiraEn: reserva.holdExpiraEn!,
      })),
    });

    const montos = dividirEnCuotas(total, partido.participantes.length);
    await Promise.all(
      partido.participantes.map((p, i) =>
        tx.cuota.create({
          data: {
            reservaId: reserva.id,
            monto: new Prisma.Decimal(montos[i]!),
            esOrganizador: p.usuarioId === partido.organizadorId,
            participanteId: p.usuarioId,
          },
        }),
      ),
    );

    await tx.auditLog.create({
      data: {
        sedeId: partido.sedeId,
        accion: 'partido.auto_reservado',
        entidad: 'Reserva',
        entidadId: reserva.id,
        despues: { partidoId: partido.id, total },
      },
    });

    return reserva.id;
  });
}
