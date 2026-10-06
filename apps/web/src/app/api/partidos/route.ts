import { NextResponse, type NextRequest } from 'next/server';
import { crearPartidoSchema, listarPartidosSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { guard, clientIp } from '@/lib/guard';
import { redis } from '@/lib/redis';
import { getSesion } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Crea un partido abierto (matchmaking). El organizador cuenta como el
 * primer cupo.
 *
 * Antes esto no validaba NADA de lo que hace falta para que el partido se
 * pueda confirmar algún día: ni que `inicio` fuera futuro, ni que
 * `canchaId` (si se fijó una cancha puntual) de verdad fuera de ese
 * `deporte`, ni que la duración calzara con el turno base de ALGUNA
 * cancha de esa disciplina. El síntoma real: el formulario mandaba
 * siempre 90 minutos fijos, y con `Cancha.duracionTurnoMin` por defecto
 * en 60 (el default del propio editor de canchas), 90 nunca es múltiplo
 * de 60 — ningún partido comunitario de un club con turnos de 1h podía
 * confirmarse jamás, y el grupo recién se enteraba al intentar pagar,
 * días después de armarse, con un error que sonaba a "no hay cupo ahora"
 * en vez de "esto nunca iba a funcionar". Ahora se valida todo esto ACÁ,
 * antes de que nadie se una a nada.
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const g = await guard(req, {
    preset: 'mutation',
    schema: crearPartidoSchema,
    idempotencyScope: 'crear-partido',
    subject: sesion.usuarioId,
  });
  if (!g.ok) return g.response;
  const { canchaId, deporte, inicioISO, duracionMin, nivel, cuposTotales, precioPorJugador, notas } = g.data;
  const sede = await getSedeActiva();

  const inicio = new Date(inicioISO);
  if (inicio <= new Date()) {
    return NextResponse.json({ error: 'fecha_invalida', message: 'Elige una fecha y hora futuras.' }, { status: 422 });
  }

  if (canchaId) {
    const cancha = await prisma.cancha.findFirst({ where: { id: canchaId, sedeId: sede.id, activa: true } });
    if (!cancha) return NextResponse.json({ error: 'cancha_no_encontrada' }, { status: 404 });
    if (cancha.deporte !== deporte) {
      return NextResponse.json(
        { error: 'cancha_no_coincide', message: 'Esa cancha no es de la disciplina elegida.' },
        { status: 422 },
      );
    }
  }

  // Busca entre las canchas activas de esa disciplina (o solo la puntual,
  // si se fijó una) si AL MENOS UNA puede jugar esta duración — no hace
  // falta que todas calcen, `confirmar` ya recorre el pool entero y le
  // basta con una. Si ninguna calza, esto nunca se va a poder confirmar.
  const candidatas = await prisma.cancha.findMany({
    where: { sedeId: sede.id, deporte, activa: true, ...(canchaId ? { id: canchaId } : {}) },
    select: { duracionTurnoMin: true, duracionMaximaMin: true },
  });
  const algunaCalza = candidatas.some(
    (c) => duracionMin % c.duracionTurnoMin === 0 && duracionMin >= c.duracionTurnoMin && duracionMin <= c.duracionMaximaMin,
  );
  if (!algunaCalza) {
    return NextResponse.json(
      {
        error: 'duracion_incompatible',
        message:
          candidatas.length === 0
            ? 'El club no tiene canchas activas de esta disciplina todavía.'
            : 'Esa duración no calza con el turno de ninguna cancha de esta disciplina. Elige otra duración.',
      },
      { status: 422 },
    );
  }

  const partido = await prisma.partidoAbierto.create({
    data: {
      sedeId: sede.id,
      canchaId,
      deporte,
      inicio,
      fin: new Date(inicio.getTime() + duracionMin * 60_000),
      nivel,
      cuposTotales,
      cuposLlenos: 1,
      precioPorJugador,
      organizadorId: sesion.usuarioId,
      notas,
      participantes: { create: { usuarioId: sesion.usuarioId, estado: 'UNIDO' } },
    },
  });

  const body = { id: partido.id, estado: partido.estado };
  await g.finish(body);
  return NextResponse.json(body, { status: 201 });
}

/** Lista partidos abiertos con paginación por cursor (no scroll infinito en el cliente). */
export async function GET(req: NextRequest) {
  // Endpoint público (sin auth) → rate-limit por IP para frenar scraping/DoS.
  const rl = await rateLimit(redis, `rl:global:${clientIp(req)}`, RATE_LIMITS.global);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  const url = new URL(req.url);
  const parsed = listarPartidosSchema.safeParse({
    deporte: url.searchParams.get('deporte') ?? undefined,
    nivel: url.searchParams.get('nivel') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'validation', issues: parsed.error.flatten() }, { status: 422 });
  const { deporte, nivel, cursor, limit } = parsed.data;
  const sede = await getSedeActiva();

  const partidos = await prisma.partidoAbierto.findMany({
    where: {
      sedeId: sede.id,
      estado: 'ABIERTO',
      ...(deporte ? { deporte } : {}),
      ...(nivel ? { nivel } : {}),
      inicio: { gt: new Date() },
    },
    orderBy: { inicio: 'asc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { cancha: true, _count: { select: { participantes: true } } },
  });

  const hayMas = partidos.length > limit;
  const pagina = hayMas ? partidos.slice(0, limit) : partidos;

  return NextResponse.json({
    items: pagina.map((p) => ({
      id: p.id,
      deporte: p.deporte,
      nivel: p.nivel,
      inicio: p.inicio,
      fin: p.fin,
      cuposTotales: p.cuposTotales,
      cuposLlenos: p.cuposLlenos,
      precioPorJugador: p.precioPorJugador,
      cancha: p.cancha ? { nombre: p.cancha.nombre, superficie: p.cancha.superficie } : null,
    })),
    nextCursor: hayMas ? pagina[pagina.length - 1]?.id ?? null : null,
  });
}
