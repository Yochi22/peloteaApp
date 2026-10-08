import { NextResponse, type NextRequest } from 'next/server';
import { crearReglaPrecioSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Crea un recargo/descuento por franja (peak/off-peak) — antes solo se
 * cargaba por seed/DB directo. Afecta de inmediato: `calcularPrecio()`
 * (packages/shared/domain/pricing.ts) lee `ReglaPrecio` directo de la base
 * en cada cálculo, no hay nada que materializar como con los descuentos
 * programados (esto no crea `Oferta`, solo cambia cómo se calcula el precio
 * base de cualquier reserva nueva).
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
    schema: crearReglaPrecioSchema,
    idempotencyScope: 'crear-regla-precio',
    subject: sesion!.usuarioId,
  });
  if (!g.ok) return g.response;
  const datos = g.data;

  const sede = await getSedeActiva();
  if (datos.canchaId) {
    const cancha = await prisma.cancha.findFirst({ where: { id: datos.canchaId, sedeId: sede.id } });
    if (!cancha) return NextResponse.json({ error: 'cancha_no_encontrada' }, { status: 404 });
  }

  const regla = await prisma.reglaPrecio.create({
    data: {
      sedeId: sede.id,
      canchaId: datos.canchaId ?? null,
      nombre: datos.nombre,
      diaSemana: datos.diaSemana ?? null,
      horaDesde: datos.horaDesde ?? null,
      horaHasta: datos.horaHasta ?? null,
      tipoModificador: datos.tipoModificador,
      valor: datos.valor,
      prioridad: datos.prioridad,
    },
  });

  await prisma.auditLog.create({
    data: {
      sedeId: sede.id,
      actorId: sesion!.usuarioId,
      accion: 'regla_precio.creada',
      entidad: 'ReglaPrecio',
      entidadId: regla.id,
      despues: { canchaId: regla.canchaId, nombre: regla.nombre, tipoModificador: regla.tipoModificador, valor: Number(regla.valor) },
      ip: g.ip,
    },
  });

  const body = { id: regla.id };
  await g.finish(body);
  return NextResponse.json(body, { status: 201 });
}
