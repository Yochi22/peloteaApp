import { NextResponse, type NextRequest } from 'next/server';
import { actualizarHorarioSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Reemplaza la disponibilidad recurrente de una cancha: un bloque por día de
 * semana (0=domingo … 6=sábado), cada uno con su hora de apertura/cierre y
 * tarifa base. Un día con `activa:false` no acepta reservas ese día de la
 * semana (no se borra el precio, por si lo vuelven a activar después).
 *
 * Upsert por día: si ya existe una `PlantillaHorario` para ese
 * (canchaId, diaSemana) se actualiza esa fila; si no, se crea. Nunca deja un
 * día sin fila — así `slotsDisponibles()`/`calcularPrecioReserva()` siempre
 * tienen un origen de verdad único por día, sin filas duplicadas compitiendo.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    schema: actualizarHorarioSchema,
    idempotencyScope: 'actualizar-horario-cancha',
    subject: `${sesion!.usuarioId}:${id}`,
  });
  if (!g.ok) return g.response;

  const sede = await getSedeActiva();
  const cancha = await prisma.cancha.findFirst({ where: { id, sedeId: sede.id } });
  if (!cancha) return NextResponse.json({ error: 'cancha_no_encontrada' }, { status: 404 });

  // Sin constraint única declarada en (canchaId, diaSemana) — Prisma exige un
  // `where` único para `upsert()`, así que buscamos la fila del día a mano y
  // decidimos update vs. create.
  for (const dia of g.data.dias) {
    const fila = await prisma.plantillaHorario.findFirst({
      where: { canchaId: id, diaSemana: dia.diaSemana },
      orderBy: { id: 'asc' },
    });
    if (fila) {
      await prisma.plantillaHorario.update({
        where: { id: fila.id },
        data: {
          horaInicio: dia.horaInicio,
          horaFin: dia.horaFin,
          precioBase: dia.precioBase,
          activa: dia.activa,
        },
      });
    } else {
      await prisma.plantillaHorario.create({
        data: {
          sedeId: sede.id,
          canchaId: id,
          diaSemana: dia.diaSemana,
          horaInicio: dia.horaInicio,
          horaFin: dia.horaFin,
          precioBase: dia.precioBase,
          activa: dia.activa,
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'cancha.horario_actualizado',
      entidad: 'Cancha',
      entidadId: id,
      despues: { dias: g.data.dias },
      ip: g.ip,
    },
  });

  const body = { ok: true };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}
