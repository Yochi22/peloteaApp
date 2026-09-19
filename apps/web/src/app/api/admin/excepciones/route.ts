import { NextResponse, type NextRequest } from 'next/server';
import { crearExcepcionSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Crea una excepción de horario (feriado/cierre, mantenimiento, torneo o
 * horario especial) — bloquea reservas NUEVAS en esa fecha/franja, ver
 * `@/lib/disponibilidad` y `@/lib/precio-reserva`. No cancela reservas ya
 * existentes que caigan en esa ventana: el admin las revisa/cancela a mano
 * si hace falta (mismo criterio que cambiar `Sede.precioMoneda`, que
 * tampoco toca nada retroactivo). Mismo nivel que el editor de horario
 * (`SEDE_ADMIN`/`PLATAFORMA_ADMIN`) — cambia qué se puede reservar.
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
    schema: crearExcepcionSchema,
    idempotencyScope: 'crear-excepcion',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;
  const datos = g.data;

  const sede = await getSedeActiva();
  if (datos.canchaId) {
    const cancha = await prisma.cancha.findFirst({ where: { id: datos.canchaId, sedeId: sede.id } });
    if (!cancha) return NextResponse.json({ error: 'cancha_no_encontrada' }, { status: 404 });
  }

  const excepcion = await prisma.excepcionHorario.create({
    data: {
      sedeId: sede.id,
      canchaId: datos.canchaId ?? null,
      fecha: new Date(datos.fechaISO),
      tipo: datos.tipo,
      horaInicio: datos.horaInicio ?? null,
      horaFin: datos.horaFin ?? null,
      nota: datos.nota ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'excepcion_horario.creada',
      entidad: 'ExcepcionHorario',
      entidadId: excepcion.id,
      despues: { canchaId: excepcion.canchaId, fecha: excepcion.fecha.toISOString(), tipo: excepcion.tipo },
      ip: g.ip,
    },
  });

  const body = { id: excepcion.id };
  await g.finish(body);
  return NextResponse.json(body, { status: 201 });
}
