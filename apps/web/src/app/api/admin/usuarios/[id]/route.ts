import { NextResponse, type NextRequest } from 'next/server';
import { actualizarStaffSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/** Cambia el rol o activa/desactiva una cuenta de staff de la propia sede. */
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
    schema: actualizarStaffSchema,
    idempotencyScope: 'actualizar-staff',
    subject: `${sesion!.usuarioId}:${id}`,
  });
  if (!g.ok) return g.response;

  if (id === sesion!.usuarioId) {
    return NextResponse.json(
      { error: 'no_puedes_modificarte', message: 'No puedes cambiar tu propio rol ni desactivarte.' },
      { status: 409 },
    );
  }

  const sede = await getSedeActiva();
  // Scoped a la sede propia y solo a cuentas de staff/admin — nunca a un
  // JUGADOR ni a otro PLATAFORMA_ADMIN desde acá.
  const existente = await prisma.usuario.findFirst({
    where: { id, sedeId: sede.id, rol: { in: ['SEDE_STAFF', 'SEDE_ADMIN'] } },
  });
  if (!existente) return NextResponse.json({ error: 'usuario_no_encontrado' }, { status: 404 });

  const actualizado = await prisma.usuario.update({ where: { id }, data: g.data });

  // Desactivar corta el acceso de inmediato — borra sus sesiones vivas en
  // vez de esperar a que expiren solas (getSesion() ya lo bloquearía, pero
  // esto además lo saca de cualquier vista en vivo que dependa de Sesion).
  if (g.data.activa === false) {
    await prisma.sesion.deleteMany({ where: { usuarioId: id } });
  }

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'staff.actualizado',
      entidad: 'Usuario',
      entidadId: id,
      antes: { rol: existente.rol, activa: existente.activa },
      despues: g.data,
      ip: g.ip,
    },
  });

  const body = { id: actualizado.id, rol: actualizado.rol, activa: actualizado.activa };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}
