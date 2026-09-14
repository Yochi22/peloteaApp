import { NextResponse, type NextRequest } from 'next/server';
import { actualizarReglaDescuentoSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { guard } from '@/lib/guard';
import { redis } from '@/lib/redis';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';
import { materializarReglaAhora } from '@/lib/materializar-descuento';

export const runtime = 'nodejs';

/** Activa/desactiva o cambia el porcentaje de una regla de descuento ya creada. */
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
    schema: actualizarReglaDescuentoSchema,
    idempotencyScope: 'actualizar-regla-descuento',
    subject: `${sesion!.usuarioId}:${id}`,
  });
  if (!g.ok) return g.response;

  const sede = await getSedeActiva();
  const existente = await prisma.reglaDescuento.findFirst({ where: { id, sedeId: sede.id } });
  if (!existente) return NextResponse.json({ error: 'regla_no_encontrada' }, { status: 404 });

  const actualizada = await prisma.reglaDescuento.update({ where: { id }, data: g.data });

  // Se desactivó: cancela las ofertas futuras que ya se materializaron pero
  // nadie tomó todavía — las que ya alguien reservó (`tomada > 0`) se dejan
  // igual, esa reserva ya existe y no se toca.
  if (g.data.activa === false) {
    await prisma.oferta.updateMany({
      where: { reglaId: id, estado: 'ACTIVA', tomada: 0 },
      data: { estado: 'CANCELADA' },
    });
  } else if (g.data.activa === true) {
    // Se reactivó: materializa de una vez en vez de esperar el próximo
    // barrido del worker (mismo motivo que al crearla).
    await materializarReglaAhora(id);
  }

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'regla_descuento.actualizada',
      entidad: 'ReglaDescuento',
      entidadId: id,
      antes: { activa: existente.activa, descuentoPct: existente.descuentoPct },
      despues: { activa: actualizada.activa, descuentoPct: actualizada.descuentoPct },
      ip: g.ip,
    },
  });

  const body = { id: actualizada.id, activa: actualizada.activa };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}

/** Borra la regla por completo — cancela igual las ofertas futuras sin tomar. */
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
  const existente = await prisma.reglaDescuento.findFirst({ where: { id, sedeId: sede.id } });
  if (!existente) return NextResponse.json({ error: 'regla_no_encontrada' }, { status: 404 });

  await prisma.$transaction([
    prisma.oferta.updateMany({ where: { reglaId: id, estado: 'ACTIVA', tomada: 0 }, data: { estado: 'CANCELADA' } }),
    prisma.reglaDescuento.delete({ where: { id } }),
  ]);

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'regla_descuento.borrada',
      entidad: 'ReglaDescuento',
      entidadId: id,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
