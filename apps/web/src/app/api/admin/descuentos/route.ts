import { NextResponse, type NextRequest } from 'next/server';
import { crearReglaDescuentoSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';
import { materializarReglaAhora } from '@/lib/materializar-descuento';

export const runtime = 'nodejs';

/**
 * Crea una regla de descuento EXPRES programada por el admin: sobre qué
 * cancha, qué día de la semana (o todos), qué horario y qué porcentaje.
 * Nunca se generan ofertas solas — se materializan filas de `Oferta` reales
 * para los próximos 14 días. Se hace AL TOQUE acá mismo (no solo esperar el
 * barrido del worker cada 30 min) para que el admin la vea reflejada de
 * inmediato al probarla como cliente — el worker sigue corriendo para
 * mantener el horizonte al día después de esto.
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const g = await guard(req, {
    preset: 'mutation',
    schema: crearReglaDescuentoSchema,
    idempotencyScope: 'crear-regla-descuento',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;
  const datos = g.data;

  const sede = await getSedeActiva();
  const cancha = await prisma.cancha.findFirst({ where: { id: datos.canchaId, sedeId: sede.id } });
  if (!cancha) return NextResponse.json({ error: 'cancha_no_encontrada' }, { status: 404 });

  const regla = await prisma.reglaDescuento.create({
    data: {
      sedeId: sede.id,
      canchaId: datos.canchaId,
      diaSemana: datos.diaSemana ?? null,
      horaInicio: datos.horaInicio,
      horaFin: datos.horaFin,
      descuentoPct: datos.descuentoPct,
      creadaPorId: sesion!.usuarioId,
    },
  });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'regla_descuento.creada',
      entidad: 'ReglaDescuento',
      entidadId: regla.id,
      despues: { canchaId: cancha.id, diaSemana: regla.diaSemana, horaInicio: regla.horaInicio, horaFin: regla.horaFin, descuentoPct: regla.descuentoPct },
      ip: g.ip,
    },
  });

  await materializarReglaAhora(regla.id);

  const body = { id: regla.id };
  await g.finish(body);
  return NextResponse.json(body, { status: 201 });
}
