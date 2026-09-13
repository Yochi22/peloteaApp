import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { getSesionServer } from '@/lib/session-server';

const CATEGORIAS = [
  { nombre: 'Pádel', color: 'var(--pl-hard)', detalle: 'Cancha techada y al aire libre' },
  { nombre: 'Vóleibol Arena', color: 'var(--pl-clay)', detalle: 'Arena, al aire libre' },
  { nombre: 'Fútbol', color: 'var(--pl-grass)', detalle: 'Grass sintético' },
];

const FEATURES = [
  { titulo: 'Descuentos exprés', texto: 'El precio baja solo cuando una franja se ve vacía.' },
  { titulo: 'Divide con amigos', texto: 'Cada quien paga su parte por un enlace.' },
  { titulo: 'Ofertas de última hora', texto: 'Si alguien cancela, te avisamos con la cancha rebajada.' },
  { titulo: '¿Quieres jugar y no tienes con quién?', texto: 'Únete a un partido abierto.' },
];

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

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const sesion = await getSesionServer();
  // Mismo criterio que /canchas: si hay sesión, mostrar "Mi cuenta" (con el
  // badge de notificaciones sin leer) en vez de solo "Entrar" — antes la
  // landing nunca reflejaba que ya habías iniciado sesión, así que después
  // de loguearse parecía que no había pasado nada hasta llegar a /canchas.
  const notisSinLeer = sesion
    ? await prisma.notificacion.count({ where: { usuarioId: sesion.usuarioId, canal: 'IN_APP', leidaEn: null } })
    : 0;
  const esStaff = sesion && ['SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN'].includes(sesion.rol);

  return (
    <main>
      <header
        className="pl-container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: 20 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="var(--pl-volt)" />
            <path
              d="M3.5 8.5c5.5 2.4 11.5 2.4 17 0M3.5 15.5c5.5-2.4 11.5-2.4 17 0"
              stroke="var(--pl-ink)"
              strokeWidth="1.7"
            />
          </svg>
          <strong style={{ fontFamily: 'var(--pl-font-display)', fontSize: 20 }}>Pelotea</strong>
        </span>
        <nav style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {sesion ? (
            <Link href={esStaff ? '/panel' : '/cuenta'} style={{ position: 'relative' }}>
              {esStaff ? 'Panel' : 'Mi cuenta'}
              {!esStaff && notisSinLeer > 0 ? (
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
          <Link className="pl-btn" href="/canchas">
            Reservar cancha
          </Link>
        </nav>
      </header>

      <section className="pl-container" style={{ paddingBlock: '28px 48px', display: 'grid', gap: 22, maxWidth: 720 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--pl-clay-deep)',
          }}
        >
          Pádel · Vóleibol arena · Fútbol
        </span>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 56px)' }}>
          Reserva tu cancha como quien compra la entrada del cine.
        </h1>
        <p style={{ fontSize: 17, color: 'var(--pl-ink-soft)' }}>
          Elige día, hora y cuántas horas quieres jugar, paga por pago móvil y manda el comprobante. El club lo
          aprueba y listo.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="pl-btn" href="/canchas">
            Ver canchas disponibles
          </Link>
          <Link className="pl-btn pl-btn--ghost" href="/partidos">
            Buscar jugadores
          </Link>
        </div>
      </section>

      <section className="pl-container" style={{ paddingBlock: '0 44px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          {CATEGORIAS.map((c) => (
            <Link
              key={c.nombre}
              href="/canchas"
              style={{ borderRadius: 16, overflow: 'hidden', border: '1.5px solid var(--pl-line)', textDecoration: 'none', color: 'inherit' }}
            >
              <CourtSvg bg={c.color} />
              <div style={{ padding: '16px 18px', background: 'var(--pl-bg-raised)' }}>
                <h3 style={{ fontSize: 20 }}>{c.nombre}</h3>
                <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 4 }}>{c.detalle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--pl-ink)', color: 'var(--pl-bg)', paddingBlock: 48 }}>
        <div
          className="pl-container"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 26 }}
        >
          {FEATURES.map((f) => (
            <div key={f.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="var(--pl-volt)" strokeWidth="1.8" />
              </svg>
              <h3 style={{ fontSize: 18, color: 'var(--pl-bg)' }}>{f.titulo}</h3>
              <p style={{ color: '#B6AC98', fontSize: 13 }}>{f.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <footer
        className="pl-container"
        style={{
          paddingBlock: 28,
          borderTop: '1.5px solid var(--pl-line)',
          color: 'var(--pl-ink-soft)',
          fontSize: 13,
        }}
      >
        Pelotea · reservas para clubes deportivos en Venezuela
      </footer>
    </main>
  );
}
