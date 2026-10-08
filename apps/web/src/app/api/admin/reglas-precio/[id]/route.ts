import { NextResponse, type NextRequest } from 'next/server';
import { actualizarReglaPrecioSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { guard } from '@/lib/guard';
import { redis } from '@/lib/redis';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/** Activa/desactiva, o cambia el valor/prioridad, de una regla de precio ya creada. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const g = await guard(req, {
    preset: 'mutation',
    schema: actualizarReglaPrecioSchema,
    idempotencyScope: 'actualizar-regla-precio',
    subject: `${sesion!.usuarioId}:${id}`,
  });
  if (!g.ok) return g.response;

  const sede = await getSedeActiva();
  const existente = await prisma.reglaPrecio.findFirst({ where: { id, sedeId: sede.id } });
  if (!existente) return NextResponse.json({ error: 'regla_no_encontrada' }, { status: 404 });

  const actualizada = await prisma.reglaPrecio.update({ where: { id }, data: g.data });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'regla_precio.actualizada',
      entidad: 'ReglaPrecio',
      entidadId: id,
      antes: { activa: existente.activa, valor: Number(existente.valor), prioridad: existente.prioridad },
      despues: g.data,
      ip: g.ip,
    },
  });

  const body = { id: actualizada.id, activa: actualizada.activa };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}

/** Borra la regla por completo. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const rl = await rateLimit(redis, `rl:mutation:${sesion!.usuarioId}`, RATE_LIMITS.mutation);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  const sede = await getSedeActiva();
  const existente = await prisma.reglaPrecio.findFirst({ where: { id, sedeId: sede.id } });
  if (!existente) return NextResponse.json({ error: 'regla_no_encontrada' }, { status: 404 });

  await prisma.reglaPrecio.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'regla_precio.borrada',
      entidad: 'ReglaPrecio',
      entidadId: id,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
