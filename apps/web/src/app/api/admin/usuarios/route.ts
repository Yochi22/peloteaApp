import { NextResponse, type NextRequest } from 'next/server';
import { crearStaffSchema } from '@pelotea/shared';
import { prisma, Prisma } from '@pelotea/db';
import { hashPassword } from '@pelotea/security';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Crea una cuenta de staff (SEDE_STAFF o SEDE_ADMIN) para la sede del admin
 * que la crea — antes la única cuenta admin era la que corrió `/configurar`,
 * así que todo el personal de un club terminaba compartiendo una sola
 * sesión (mala trazabilidad de quién aprobó qué pago, y un riesgo de
 * seguridad real). El admin fija la contraseña acá mismo y se la pasa a la
 * persona por fuera (no hay email conectado todavía — mismo criterio que
 * `/configurar`, que hace lo mismo para el primer admin).
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
    schema: crearStaffSchema,
    idempotencyScope: 'crear-staff',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;
  const { nombre, email, telefono, password, rol } = g.data;

  const sede = await getSedeActiva();

  try {
    const hash = await hashPassword(password);
    const nuevo = await prisma.usuario.create({
      data: { nombre, email, telefono, hashPassword: hash, rol, sedeId: sede.id, emailVerified: true },
    });

    await prisma.auditLog.create({
      data: {
        sedeId: sede.id,
        actorId: sesion!.usuarioId,
        accion: 'staff.creado',
        entidad: 'Usuario',
        entidadId: nuevo.id,
        despues: { nombre, email, rol },
        ip: g.ip,
      },
    });

    const body = { id: nuevo.id };
    await g.finish(body);
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'email_en_uso', message: 'Ya existe una cuenta con ese email.' }, { status: 409 });
    }
    console.error('POST /api/admin/usuarios', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
