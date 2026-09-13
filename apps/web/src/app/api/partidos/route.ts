import { NextResponse, type NextRequest } from 'next/server';
import { crearPartidoSchema, listarPartidosSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { guard, clientIp } from '@/lib/guard';
import { redis } from '@/lib/redis';
import { getSesion } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/** Crea un partido abierto (matchmaking). El organizador cuenta como el primer cupo. */
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
  const { canchaId, deporte, inicioISO, finISO, nivel, cuposTotales, precioPorJugador, notas } = g.data;
  const sede = await getSedeActiva();

  const partido = await prisma.partidoAbierto.create({
    data: {
      sedeId: sede.id,
      canchaId,
      deporte,
      inicio: new Date(inicioISO),
      fin: new Date(finISO),
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
