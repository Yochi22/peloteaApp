import { NextResponse, type NextRequest } from 'next/server';
import { cargarTasaCambioSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Carga MANUAL de la tasa BCV del día — sin scraping ni API automática (todo
 * el dinero en este proyecto es manual, ver CLAUDE.md §5). Un `upsert` por
 * `[moneda, fecha]`: si staff se equivoca y la vuelve a cargar el mismo día,
 * corrige la fila en vez de duplicarla.
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const g = await guard(req, {
    preset: 'mutation',
    schema: cargarTasaCambioSchema,
    idempotencyScope: 'cargar-tasa-cambio',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;
  const { moneda, tasaVES, fechaISO } = g.data;

  const fecha = fechaISO ? new Date(fechaISO) : new Date();
  fecha.setHours(0, 0, 0, 0);
  if (fecha.getTime() > Date.now()) {
    return NextResponse.json({ error: 'fecha_futura' }, { status: 422 });
  }

  const fila = await prisma.tasaCambio.upsert({
    where: { moneda_fecha: { moneda, fecha } },
    update: { tasaVES, cargadaPorId: sesion!.usuarioId },
    create: { moneda, fecha, tasaVES, cargadaPorId: sesion!.usuarioId },
  });

  await prisma.auditLog.create({
    data: {
      actorId: sesion!.usuarioId,
      accion: 'tasa_cambio.cargada',
      entidad: 'TasaCambio',
      entidadId: fila.id,
      despues: { moneda, tasaVES, fecha: fecha.toISOString() },
      ip: g.ip,
    },
  });

  const body = { id: fila.id, moneda: fila.moneda, tasaVES: Number(fila.tasaVES), fecha: fila.fecha };
  await g.finish(body);
  return NextResponse.json(body, { status: 200 });
}
