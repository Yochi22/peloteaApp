import { NextResponse, type NextRequest } from 'next/server';
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
 * Un jugador se retira de un partido abierto al que se unió. Solo mientras
 * el partido sigue `ABIERTO` — una vez se llena (`COMPLETO`) el club puede
 * haber reservado y dividido el pago automáticamente
 * (`autoReservarPartido()`); retirarse después de eso rompería ese split, así
 * que en ese punto hay que hablar con el organizador o el club. El
 * organizador tampoco puede "retirarse" de su propio partido — eso es
 * cancelarlo, que es una acción distinta (no existe todavía en la UI).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: partidoId } = await params;
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const rl = await rateLimit(redis, `rl:mutation:${sesion.usuarioId}`, RATE_LIMITS.mutation);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const partido = await tx.partidoAbierto.findUnique({ where: { id: partidoId } });
      if (!partido) throw new HttpError(404, 'partido_no_encontrado');
      if (partido.organizadorId === sesion.usuarioId) throw new HttpError(409, 'el_organizador_no_puede_retirarse');
      if (partido.estado !== 'ABIERTO') throw new HttpError(409, 'partido_ya_no_se_puede_dejar');

      const participante = await tx.participantePartido.findUnique({
        where: { partidoId_usuarioId: { partidoId, usuarioId: sesion.usuarioId } },
      });
      if (!participante || participante.estado === 'SALIO') {
        throw new HttpError(404, 'no_estas_en_este_partido');
      }

      await tx.participantePartido.update({ where: { id: participante.id }, data: { estado: 'SALIO' } });
      // Condicionado (`WHERE cuposLlenos > 0`) por el mismo motivo que el
      // incremento al unirse: nunca dejar el contador en negativo si esto
      // se llama dos veces a la vez.
      await tx.partidoAbierto.updateMany({
        where: { id: partidoId, cuposLlenos: { gt: 0 } },
        data: { cuposLlenos: { decrement: 1 } },
      });

      await tx.auditLog.create({
        data: {
          sedeId: partido.sedeId,
          actorId: sesion.usuarioId,
          accion: 'partido.salida',
          entidad: 'PartidoAbierto',
          entidadId: partidoId,
        },
      });

      return { ok: true };
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/partidos/[id]/salir', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
