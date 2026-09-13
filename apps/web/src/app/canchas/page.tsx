import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, SUPERFICIE_TOKEN, DEPORTES, type Deporte, type Superficie } from '@pelotea/shared';
import { getSedeActivaONull } from '@/lib/sede';
import { getSesionServer } from '@/lib/session-server';

export const dynamic = 'force-dynamic';

const TOKEN_COLOR: Record<'clay' | 'grass' | 'hard', string> = {
  clay: 'var(--pl-clay)',
  grass: 'var(--pl-grass)',
  hard: 'var(--pl-hard)',
};

function CourtSvg({ bg }: { bg: string }) {
  return (
    <svg viewBox="0 0 300 132" width="100%" height="132" style={{ display: 'block', background: bg }} aria-hidden>
      <g stroke="#fff" strokeWidth="2" fill="none" opacity={0.9}>
        <rect x="16" y="14" width="268" height="104" />
        <line x1="150" y1="14" x2="150" y2="118" />
        <line x1="16" y1="66" x2="284" y2="66" />
      </g>
    </svg>
  );
}

interface CanchaVisible {
  id: string;
  nombre: string;
  deporte: string;
  superficie: string;
  techada: boolean;
  cantidad: number;
  _count: { plantillas: number };
}

function CanchasGrid({ canchas }: { canchas: CanchaVisible[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
      {canchas.map((c) => {
        const sinHorario = c._count.plantillas === 0;
        return (
          <Link
            key={c.id}
            href={sinHorario ? '#' : `/canchas/${c.id}`}
            aria-disabled={sinHorario}
            style={{
              borderRadius: 16,
              overflow: 'hidden',
              border: '1.5px solid var(--pl-line)',
              textDecoration: 'none',
              color: 'inherit',
              opacity: sinHorario ? 0.6 : 1,
              pointerEvents: sinHorario ? 'none' : 'auto',
            }}
          >
            <CourtSvg bg={TOKEN_COLOR[SUPERFICIE_TOKEN[c.superficie as Superficie]]} />
            <div style={{ padding: '16px 18px', background: 'var(--pl-bg-raised)' }}>
              <h3 style={{ fontSize: 18 }}>{c.nombre}</h3>
              <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 4 }}>
                {DEPORTE_LABEL[c.deporte as Deporte]} · {c.techada ? 'techada' : 'al aire libre'}
                {c.cantidad > 1 ? ` · ${c.cantidad} canchas` : ''}
                {sinHorario ? ' · próximamente' : ''}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default async function CanchasPage({ searchParams }: { searchParams: Promise<{ deporte?: string }> }) {
  const { deporte: deporteFiltro } = await searchParams;
  const sede = await getSedeActivaONull();
  const sesion = await getSesionServer();
  const notisSinLeer = sesion
    ? await prisma.notificacion.count({ where: { usuarioId: sesion.usuarioId, canal: 'IN_APP', leidaEn: null } })
    : 0;

  if (!sede) {
    return (
      <main className="pl-container" style={{ paddingBlock: 60, textAlign: 'center' }}>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 15 }}>
          Todavía no hay ningún club configurado en esta instancia. Vuelve pronto.
        </p>
      </main>
    );
  }

  const canchas = await prisma.cancha.findMany({
    where: { sedeId: sede.id, activa: true },
    orderBy: { orden: 'asc' },
    include: { _count: { select: { plantillas: { where: { activa: true } } } } },
  });

  // Solo se ofrecen como filtro los deportes que de verdad tiene esta sede —
  // no los 9 posibles, para no mostrarle al usuario categorías vacías.
  const deportesDisponibles = DEPORTES.filter((d) => canchas.some((c) => c.deporte === d));
  const filtroValido = deporteFiltro && (deportesDisponibles as readonly string[]).includes(deporteFiltro);
  const visibles = filtroValido ? canchas.filter((c) => c.deporte === deporteFiltro) : canchas;

  return (
    <main>
      <header className="pl-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: 20 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="var(--pl-volt)" />
            <path d="M3.5 8.5c5.5 2.4 11.5 2.4 17 0M3.5 15.5c5.5-2.4 11.5-2.4 17 0" stroke="var(--pl-ink)" strokeWidth="1.7" />
          </svg>
          <strong style={{ fontFamily: 'var(--pl-font-display)', fontSize: 20 }}>Pelotea</strong>
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {sesion ? (
            <Link href="/cuenta" style={{ position: 'relative' }}>
              Mi cuenta
              {notisSinLeer > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -14,
                    background: 'var(--pl-clay)',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 5px',
                    minWidth: 16,
                    textAlign: 'center',
                  }}
                >
                  {notisSinLeer}
                </span>
              ) : null}
            </Link>
          ) : (
            <Link href="/entrar">Entrar</Link>
          )}
        </nav>
      </header>

      <section className="pl-container" style={{ paddingBlock: '4px 12px' }}>
        <h1 style={{ fontSize: 28 }}>Canchas disponibles</h1>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 4 }}>
          {sede.nombre}
        </p>
      </section>

      {deportesDisponibles.length > 1 ? (
        <section className="pl-container" style={{ paddingBlock: '4px 8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href="/canchas"
            className={filtroValido ? 'pl-btn pl-btn--ghost' : 'pl-btn'}
            style={{ textDecoration: 'none', fontSize: 13, padding: '7px 14px' }}
          >
            Todas
          </Link>
          {deportesDisponibles.map((d) => (
            <Link
              key={d}
              href={`/canchas?deporte=${d}`}
              className={deporteFiltro === d ? 'pl-btn' : 'pl-btn pl-btn--ghost'}
              style={{ textDecoration: 'none', fontSize: 13, padding: '7px 14px' }}
            >
              {DEPORTE_LABEL[d as Deporte]}
            </Link>
          ))}
        </section>
      ) : null}

      <section className="pl-container" style={{ paddingBlock: '12px 44px' }}>
        {visibles.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 20 }}>
            No hay canchas de esta categoría todavía.
          </p>
        ) : filtroValido ? (
          <CanchasGrid canchas={visibles} />
        ) : (
          // Sin filtro: agrupadas por deporte con su propio título — más
          // organizado que una sola grilla plana cuando la sede tiene varias
          // categorías (antes se perdían mezcladas entre sí).
          deportesDisponibles.map((d) => (
            <div key={d} style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>{DEPORTE_LABEL[d as Deporte]}</h2>
              <CanchasGrid canchas={visibles.filter((c) => c.deporte === d)} />
            </div>
          ))
        )}
      </section>
    </main>
  );
}
