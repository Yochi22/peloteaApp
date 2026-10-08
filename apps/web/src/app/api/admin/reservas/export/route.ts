import { NextResponse, type NextRequest } from 'next/server';
import { prisma, type Prisma } from '@pelotea/db';
import { type Deporte } from '@pelotea/shared';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';
import { aCsv } from '@/lib/csv';

export const runtime = 'nodejs';

const ESTADO_LABEL: Record<string, string> = {
  CONFIRMADA: 'Confirmada',
  COMPLETADA: 'Jugada',
  NO_SHOW: 'No llegó',
  CANCELADA: 'Cancelada',
};

/**
 * Export CSV de reservas — mismo filtro de fecha/deporte que `/panel/reservas`,
 * pedido desde el diseño original (CLAUDE.md §6: "rango de fechas + export
 * CSV en todas") y nunca construido. Mismo nivel de acceso que ver la lista
 * en el panel (SEDE_STAFF puede ver sus propios pagos, así que también
 * puede exportar lo mismo que ya ve en pantalla).
 */
export async function GET(req: NextRequest) {
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const sede = await getSedeActiva();
  const url = new URL(req.url);
  const desdeRaw = url.searchParams.get('desde');
  const hastaRaw = url.searchParams.get('hasta');
  const deporteFiltro = url.searchParams.get('deporte');

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const desde = desdeRaw ? new Date(`${desdeRaw}T00:00:00`) : hoy;
  const hasta = hastaRaw ? new Date(`${hastaRaw}T23:59:59.999`) : new Date(hoy.getTime() + 24 * 60 * 60_000);

  const where: Prisma.ReservaWhereInput = {
    sedeId: sede.id,
    estado: { in: ['CONFIRMADA', 'COMPLETADA', 'NO_SHOW', 'CANCELADA'] },
    inicio: { gte: desde, lt: hasta },
    ...(deporteFiltro ? { cancha: { deporte: deporteFiltro as Deporte } } : {}),
  };

  const filas = await prisma.reserva.findMany({
    where,
    orderBy: { inicio: 'asc' },
    include: { cancha: true, organizador: true },
  });

  const csv = aCsv([
    ['Fecha', 'Hora', 'Cancha', 'Duración (h)', 'Cliente', 'Invitado', 'Estado', 'Monto (Bs)', 'Dividida', 'Motivo cancelación'],
    ...filas.map((r) => [
      r.inicio.toLocaleDateString('es-VE'),
      r.inicio.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
      r.cancha.nombre,
      Math.round((r.fin.getTime() - r.inicio.getTime()) / 3_600_000),
      r.organizador.nombre,
      r.organizador.esInvitado ? 'Sí' : 'No',
      ESTADO_LABEL[r.estado] ?? r.estado,
      Number(r.precioTotal).toFixed(2),
      r.esDividida ? 'Sí' : 'No',
      r.motivoCancelacion ?? '',
    ]),
  ]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reservas_${desde.toISOString().slice(0, 10)}_${new Date(hasta.getTime() - 1).toISOString().slice(0, 10)}.csv"`,
    },
  });
}
