import { NextResponse, type NextRequest } from 'next/server';
import { actualizarCanchaSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Actualiza los datos de una cancha (nombre, deporte, superficie, techada,
 * capacidad, duraciones) o la activa/desactiva. Desactivar NO cancela
 * reservas ya confirmadas — solo la saca de la disponibilidad para reservas
 * nuevas (`/api/reservas` ya filtra `activa: true`); las que ya existen las
 * maneja el club a mano si hace falta.
 */
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
    schema: actualizarCanchaSchema,
    idempotencyScope: 'actualizar-cancha',
    subject: `${sesion!.usuarioId}:${id}`,
  });
  if (!g.ok) return g.response;

  const sede = await getSedeActiva();
  const existente = await prisma.cancha.findFirst({ where: { id, sedeId: sede.id } });
  if (!existente) return NextResponse.json({ error: 'cancha_no_encontrada' }, { status: 404 });

  if (g.data.duracionTurnoMin !== undefined || g.data.duracionMaximaMin !== undefined) {
    const turno = g.data.duracionTurnoMin ?? existente.duracionTurnoMin;
    const maxima = g.data.duracionMaximaMin ?? existente.duracionMaximaMin;
    if (maxima < turno || maxima % turno !== 0) {
      return NextResponse.json({ error: 'duraciones_invalidas' }, { status: 422 });
    }
  }

  const actualizada = await prisma.cancha.update({ where: { id }, data: g.data });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'cancha.actualizada',
      entidad: 'Cancha',
      entidadId: id,
      antes: { nombre: existente.nombre, activa: existente.activa },
      despues: { nombre: actualizada.nombre, activa: actualizada.activa },
      ip: g.ip,
    },
  });

  const body = { id: actualizada.id, activa: actualizada.activa };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}
