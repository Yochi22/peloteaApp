import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { getSesionServer } from '@/lib/session-server';

export const dynamic = 'force-dynamic';

const ESTADO_RESERVA_LABEL: Record<string, { texto: string; tono: string }> = {
  PENDIENTE_PAGO: { texto: 'Pendiente de pago', tono: 'var(--pl-warn)' },
  COMPROBANTE_ENVIADO: { texto: 'En revisión', tono: 'var(--pl-warn)' },
  EN_REVISION: { texto: 'En revisión', tono: 'var(--pl-warn)' },
  CONFIRMADA: { texto: 'Confirmada', tono: 'var(--pl-ok)' },
  COMPLETADA: { texto: 'Jugada', tono: 'var(--pl-ink-soft)' },
  NO_SHOW: { texto: 'No llegaste', tono: 'var(--pl-danger)' },
  CANCELADA: { texto: 'Cancelada', tono: 'var(--pl-danger)' },
  EXPIRADA: { texto: 'Expiró', tono: 'var(--pl-ink-soft)' },
};

export default async function CuentaPage() {
  const sesion = await getSesionServer();
  if (!sesion) redirect('/entrar?next=/cuenta');
  // Roles de club tienen su propio panel — esta pantalla es para jugadores.
  if (['SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN'].includes(sesion.rol)) redirect('/panel');

  const [usuario, notisSinLeer, reservas, partidosCreados, participaciones] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: sesion.usuarioId } }),
    prisma.notificacion.count({ where: { usuarioId: sesion.usuarioId, canal: 'IN_APP', leidaEn: null } }),
    prisma.reserva.findMany({
      where: { organizadorId: sesion.usuarioId },
      orderBy: { inicio: 'desc' },
      take: 20,
      include: { cancha: true },
    }),
    prisma.partidoAbierto.findMany({
      where: { organizadorId: sesion.usuarioId },
      orderBy: { inicio: 'desc' },
      take: 10,
      include: { cancha: true, participantes: true },
    }),
    prisma.participantePartido.findMany({
      where: { usuarioId: sesion.usuarioId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { partido: { include: { cancha: true, organizador: true } } },
    }),
  ]);
  if (!usuario) redirect('/entrar?next=/cuenta');

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 640 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        Mi cuenta
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>{usuario.nombre}</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 4 }}>
        {usuario.email ?? usuario.telefono ?? ''}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <Link href="/notificaciones" className="pl-btn pl-btn--ghost" style={{ textDecoration: 'none', position: 'relative' }}>
          Notificaciones{notisSinLeer > 0 ? ` (${notisSinLeer})` : ''}
        </Link>
        <Link href="/cuenta/2fa" className="pl-btn pl-btn--ghost" style={{ textDecoration: 'none' }}>
          Seguridad
        </Link>
        <Link href="/partidos/crear" className="pl-btn" style={{ textDecoration: 'none' }}>
          Crear partido
        </Link>
      </div>

      {/* ── Mis reservas ─────────────────────────────────────────────── */}
      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 17 }}>Mis reservas</h2>
        {reservas.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 8 }}>
            Todavía no has hecho ninguna reserva.{' '}
            <Link href="/canchas">Reserva una cancha</Link>.
          </p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {reservas.map((r) => {
              const info = ESTADO_RESERVA_LABEL[r.estado] ?? { texto: r.estado, tono: 'var(--pl-ink-soft)' };
              return (
                <Link
                  key={r.id}
                  href={`/reservas/${r.id}/comprobante`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 0',
                    borderBottom: '1.5px solid var(--pl-line)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{r.cancha.nombre}</p>
                    <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
                      {r.inicio.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} · Bs{' '}
                      {Number(r.precioTotal).toLocaleString('es-VE')}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: info.tono, flex: 'none' }}>{info.texto}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Mis partidos ─────────────────────────────────────────────── */}
      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 17 }}>Partidos que organizo</h2>
        {partidosCreados.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 8 }}>No has creado ningún partido.</p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {partidosCreados.map((p) => (
              <div key={p.id} style={{ padding: '10px 0', borderBottom: '1.5px solid var(--pl-line)' }}>
                <p style={{ fontWeight: 600, fontSize: 14 }}>
                  {DEPORTE_LABEL[p.deporte as Deporte]} · {p.cancha?.nombre ?? 'sin cancha asignada'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
                  {p.inicio.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} · {p.cuposLlenos}/
                  {p.cuposTotales} cupos · {p.estado}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {participaciones.length > 0 ? (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 17 }}>Partidos a los que me uní</h2>
          <div style={{ marginTop: 10 }}>
            {participaciones.map((pp) => (
              <div key={pp.id} style={{ padding: '10px 0', borderBottom: '1.5px solid var(--pl-line)' }}>
                <p style={{ fontWeight: 600, fontSize: 14 }}>
                  {DEPORTE_LABEL[pp.partido.deporte as Deporte]} · organiza {pp.partido.organizador.nombre}
                </p>
                <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
                  {pp.partido.inicio.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                  {pp.partido.cancha?.nombre ?? 'sin cancha asignada'} · {pp.partido.estado}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
