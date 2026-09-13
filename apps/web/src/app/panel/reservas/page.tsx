import Link from 'next/link';
import { prisma, type Prisma } from '@pelotea/db';
import { DEPORTE_LABEL, DEPORTES, type Deporte } from '@pelotea/shared';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { ListaReservas, type ReservaFila } from './ListaReservas';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 15;

function inicioDeHoyLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function ReservasPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; desde?: string; hasta?: string; deporte?: string }>;
}) {
  await requireSesionPanel('/panel/reservas');

  const sede = await getSedeActiva();
  const { pagina: paginaRaw, desde: desdeRaw, hasta: hastaRaw, deporte: deporteRaw } = await searchParams;
  const pagina = Math.max(1, Number(paginaRaw ?? 1) || 1);

  // Sin filtro de fecha: el mes actual completo — evita que la lista por
  // defecto sea "todo el historial" (con meses de uso real, sería
  // interminable) sin obligar a nadie a elegir algo antes de ver nada.
  const hoy = inicioDeHoyLocal();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const finMesActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const desde = desdeRaw ? new Date(`${desdeRaw}T00:00:00`) : inicioMesActual;
  const hasta = hastaRaw ? new Date(`${hastaRaw}T23:59:59.999`) : finMesActual;

  // No listar categorías que la sede ni siquiera tiene — mismo criterio que /canchas.
  const canchasSede = await prisma.cancha.findMany({ where: { sedeId: sede.id }, select: { deporte: true } });
  const deportesConCancha = DEPORTES.filter((d) => canchasSede.some((c) => c.deporte === d));
  const deporteFiltro = deporteRaw && (deportesConCancha as readonly string[]).includes(deporteRaw) ? deporteRaw : undefined;

  const where: Prisma.ReservaWhereInput = {
    sedeId: sede.id,
    estado: { in: ['CONFIRMADA', 'COMPLETADA', 'NO_SHOW', 'CANCELADA'] },
    inicio: { gte: desde, lt: hasta },
    ...(deporteFiltro ? { cancha: { deporte: deporteFiltro as Deporte } } : {}),
  };

  const [total, filas] = await Promise.all([
    prisma.reserva.count({ where }),
    prisma.reserva.findMany({
      where,
      orderBy: { inicio: 'desc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: { cancha: true, organizador: true },
    }),
  ]);

  const reservas: ReservaFila[] = filas.map((r) => ({
    id: r.id,
    cancha: r.cancha.nombre,
    persona: r.organizador.nombre,
    esInvitado: r.organizador.esInvitado,
    inicio: r.inicio.toISOString(),
    estado: r.estado,
    monto: Number(r.precioTotal),
    esDividida: r.esDividida,
    motivoCancelacion: r.motivoCancelacion,
  }));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 900 }}>
      <Link href="/panel" style={{ fontSize: 13 }}>
        ← Panel
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            Reservas
          </p>
          <h1 style={{ fontSize: 26, marginTop: 4 }}>{total} en el rango</h1>
        </div>
        <Link href="/panel/agenda" className="pl-btn pl-btn--ghost" style={{ textDecoration: 'none' }}>
          Ver agenda del día →
        </Link>
      </div>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Incluye canceladas — si el cliente canceló, el abono no se devuelve y ese ingreso sigue contando; si canceló
        el club, la devolución (si aplica) la hace el club por fuera del sistema. Marca "no llegó" en un turno que
        ya pasó — afecta la reputación del jugador.
      </p>

      <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 18 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
          Desde
          <input type="date" name="desde" defaultValue={fmt(desde)} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 13 }} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={fmt(new Date(hasta.getTime() - 1))}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 13 }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
          Categoría
          <select name="deporte" defaultValue={deporteFiltro ?? ''} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 13 }}>
            <option value="">Todas</option>
            {deportesConCancha.map((d) => (
              <option key={d} value={d}>
                {DEPORTE_LABEL[d as Deporte]}
              </option>
            ))}
          </select>
        </label>
        <button className="pl-btn" type="submit" style={{ padding: '9px 16px' }}>
          Filtrar
        </button>
        {desdeRaw || hastaRaw || deporteFiltro ? (
          <Link href="/panel/reservas" className="pl-btn pl-btn--ghost" style={{ textDecoration: 'none', padding: '9px 16px' }}>
            Limpiar
          </Link>
        ) : null}
      </form>

      <div style={{ marginTop: 20 }}>
        <ListaReservas reservas={reservas} pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / POR_PAGINA))} />
      </div>
    </main>
  );
}
