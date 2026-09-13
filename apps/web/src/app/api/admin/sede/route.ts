import { NextResponse, type NextRequest } from 'next/server';
import { actualizarSedeSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva, invalidarSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Cambia la moneda en la que la sede fija sus tarifas (`Sede.precioMoneda`).
 * Solo SEDE_ADMIN/PLATAFORMA_ADMIN — es configuración de negocio, no una
 * tarea operativa del día a día como aprobar pagos (SEDE_STAFF queda afuera,
 * igual que en `requireRol`). Ver `2fa_requerido`: estos roles ya exigen 2FA
 * activo para cualquier acción administrativa (session.ts).
 *
 * OJO: esto NO convierte los precios ya cargados (`PlantillaHorario.precioBase`,
 * `ReglaPrecio` de tipo MONTO_FIJO) — solo cambia en qué moneda se interpretan
 * de ahí en adelante. Si el club pasa de USD a VES, un precioBase de "6" pasa
 * de significar "6 dólares" a significar "6 bolívares" — hay que revisar y
 * volver a cargar las tarifas a mano después del cambio. La UI lo advierte.
 */
export async function PATCH(req: NextRequest) {
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const g = await guard(req, {
    preset: 'mutation',
    schema: actualizarSedeSchema,
    idempotencyScope: 'actualizar-sede',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;
  const { precioMoneda } = g.data;

  const sede = await getSedeActiva();
  const actualizada = await prisma.sede.update({
    where: { id: sede.id },
    data: { precioMoneda },
  });
  invalidarSedeActiva();

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'sede.moneda_cambiada',
      entidad: 'Sede',
      entidadId: sede.id,
      antes: { precioMoneda: sede.precioMoneda },
      despues: { precioMoneda: actualizada.precioMoneda },
      ip: g.ip,
    },
  });

  const body = { precioMoneda: actualizada.precioMoneda };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}
