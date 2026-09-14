import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { getSesionServer } from '@/lib/session-server';
import { getSedeActivaONull } from '@/lib/sede';
import { ListaPartidos, type PartidoItem } from './ListaPartidos';

export const dynamic = 'force-dynamic';

export default async function PartidosPage() {
  const sesion = await getSesionServer();
  const sede = await getSedeActivaONull();

  if (!sede) {
    return (
      <main className="pl-container" style={{ paddingBlock: 60, textAlign: 'center' }}>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 15 }}>
          Todavía no hay ningún club configurado en esta instancia. Vuelve pronto.
        </p>
      </main>
    );
  }

  const partidos = await prisma.partidoAbierto.findMany({
    where: { sedeId: sede.id, estado: 'ABIERTO', inicio: { gt: new Date() } },
    orderBy: { inicio: 'asc' },
    take: 11,
    include: { cancha: true },
  });
  const hayMas = partidos.length > 10;
  const pagina = hayMas ? partidos.slice(0, 10) : partidos;

  const items: PartidoItem[] = pagina.map((p) => ({
    id: p.id,
    deporte: p.deporte,
    deporteLabel: DEPORTE_LABEL[p.deporte as Deporte],
    nivel: p.nivel,
    inicio: p.inicio.toISOString(),
    fin: p.fin.toISOString(),
    cuposTotales: p.cuposTotales,
    cuposLlenos: p.cuposLlenos,
    precioPorJugador: Number(p.precioPorJugador),
    cancha: p.cancha ? { nombre: p.cancha.nombre, superficie: p.cancha.superficie } : null,
  }));

  return (
    <main className="pl-container" style={{ paddingBlock: 32, maxWidth: 720 }}>
      <Link href="/" style={{ fontSize: 13 }}>
        ← Inicio
      </Link>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            Pelotea · comunidad
          </p>
          <h1 style={{ fontSize: 28, marginTop: 4 }}>Partidos abiertos</h1>
        </div>
        {sesion ? (
          <Link className="pl-btn" href="/partidos/crear">
            Crear partido
          </Link>
        ) : (
          <Link className="pl-btn" href="/entrar?next=/partidos/crear">
            Crear partido
          </Link>
        )}
      </div>

      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 8 }}>
        Unirte a un partido y crear el tuyo exige una cuenta gratis — así el club y los demás jugadores saben
        con quién van a jugar.
      </p>

      <div style={{ marginTop: 22 }}>
        <ListaPartidos inicial={items} autenticado={!!sesion} />
      </div>
    </main>
  );
}
