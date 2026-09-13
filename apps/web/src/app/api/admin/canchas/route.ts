import { NextResponse, type NextRequest } from 'next/server';
import { crearCanchaSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Crea una cancha nueva en la sede activa. Solo SEDE_ADMIN/PLATAFORMA_ADMIN
 * (control de inventario, no una tarea de staff) — mismo criterio que
 * `/api/admin/sede`. Nace `activa:true` pero SIN ninguna `PlantillaHorario`:
 * no acepta reservas hasta que se configure el horario
 * (`PUT /api/admin/canchas/[id]/horario`) — mejor "no aparece disponible"
 * que "aparece disponible 24/7 por defecto" mientras el club todavía la
 * está configurando.
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
    schema: crearCanchaSchema,
    idempotencyScope: 'crear-cancha',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;
  const datos = g.data;

  const sede = await getSedeActiva();
  const ultima = await prisma.cancha.findFirst({
    where: { sedeId: sede.id },
    orderBy: { orden: 'desc' },
    select: { orden: true },
  });

  const cancha = await prisma.cancha.create({
    data: {
      sedeId: sede.id,
      nombre: datos.nombre,
      deporte: datos.deporte,
      superficie: datos.superficie,
      techada: datos.techada,
      capacidad: datos.capacidad,
      duracionTurnoMin: datos.duracionTurnoMin,
      duracionMaximaMin: datos.duracionMaximaMin,
      orden: (ultima?.orden ?? -1) + 1,
    },
  });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'cancha.creada',
      entidad: 'Cancha',
      entidadId: cancha.id,
      despues: { nombre: cancha.nombre, deporte: cancha.deporte },
      ip: g.ip,
    },
  });

  const body = { id: cancha.id };
  await g.finish(body);
  return NextResponse.json(body, { status: 201 });
}
