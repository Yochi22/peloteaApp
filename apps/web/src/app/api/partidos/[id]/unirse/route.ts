import { NextResponse, type NextRequest } from 'next/server';
import { unirsePartidoSchema, PLANTILLAS_NOTIFICACION } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
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
 * Cuando se llena, NO se reserva nada solo — el diseño de "partidos
 * comunitarios" pide que el slot no se bloquee mientras se arma el grupo
 * (ver CLAUDE.md). Solo se avisa al organizador (WhatsApp + in-app) para que
 * entre a confirmar y pagar (`POST /api/partidos/[id]/confirmar`), que ahí
 * sí revalida disponibilidad real en el pool de canchas antes de reservar.
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
      // Respaldo del barrido del worker (cada 5 min) — no depender solo de
      // que ya haya corrido para rechazar unirse a algo cuya hora ya pasó.
      if (partido.inicio <= new Date()) throw new HttpError(409, 'partido_ya_paso');

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
        await tx.notificacion.createMany({
          data: [
            { usuarioId: partido.organizadorId, canal: 'WHATSAPP', plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_COMPLETO, payload: { partidoId } },
            { usuarioId: partido.organizadorId, canal: 'IN_APP', plantilla: PLANTILLAS_NOTIFICACION.PARTIDO_COMPLETO, payload: { partidoId } },
          ],
        });
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

      return { cuposLlenos: actualizado.cuposLlenos, completo: seCompleto };
    });

    await g.finish(resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/partidos/[id]/unirse', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
