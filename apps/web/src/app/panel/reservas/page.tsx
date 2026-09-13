import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { ListaReservas, type ReservaFila } from './ListaReservas';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 15;

export default async function ReservasPanelPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await requireSesionPanel('/panel/reservas');

  const sede = await getSedeActiva();
  const { pagina: paginaRaw } = await searchParams;
  const pagina = Math.max(1, Number(paginaRaw ?? 1) || 1);

  const [total, filas] = await Promise.all([
    prisma.reserva.count({
      where: { sedeId: sede.id, estado: { in: ['CONFIRMADA', 'COMPLETADA', 'NO_SHOW', 'CANCELADA'] } },
    }),
    prisma.reserva.findMany({
      where: { sedeId: sede.id, estado: { in: ['CONFIRMADA', 'COMPLETADA', 'NO_SHOW', 'CANCELADA'] } },
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
          <h1 style={{ fontSize: 26, marginTop: 4 }}>Últimas {total}</h1>
        </div>
      </div>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Incluye canceladas — si el cliente canceló, el abono no se devuelve y ese ingreso sigue contando; si canceló
        el club, la devolución (si aplica) la hace el club por fuera del sistema. Marca "no llegó" en un turno que
        ya pasó — afecta la reputación del jugador.
      </p>

      <div style={{ marginTop: 20 }}>
        <ListaReservas reservas={reservas} pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / POR_PAGINA))} />
      </div>
    </main>
  );
}
