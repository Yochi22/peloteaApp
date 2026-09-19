import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { getSesionServer } from '@/lib/session-server';
import { RetirarsePartido } from './RetirarsePartido';
import { ConfirmarPartido } from './ConfirmarPartido';
import { CancelarPartido } from './CancelarPartido';
import { CerrarSesion } from './CerrarSesion';

const NIVEL_LABEL: Record<string, string> = {
  PRINCIPIANTE: 'principiante',
  INTERMEDIO: 'intermedio',
  AVANZADO: 'avanzado',
  COMPETITIVO: 'competitivo',
};

const ESTADO_PARTIDO_LABEL: Record<string, { texto: string; tono: string }> = {
  ABIERTO: { texto: 'Organizándose', tono: 'var(--pl-warn)' },
  COMPLETO: { texto: 'Cupo lleno — falta confirmar', tono: 'var(--pl-clay-deep)' },
  CONFIRMADO: { texto: 'Confirmado', tono: 'var(--pl-ok)' },
  CANCELADO: { texto: 'Cancelado', tono: 'var(--pl-danger)' },
  JUGADO: { texto: 'Jugado', tono: 'var(--pl-ink-soft)' },
  EXPIRADO: { texto: 'Expiró — pasó la hora sin completarse', tono: 'var(--pl-ink-soft)' },
};

/** Mismo criterio que `formatoJid()` del worker: normaliza a wa.me/58<número sin el 0>. */
function linkWhatsapp(telefonoVe: string): string {
  const digits = telefonoVe.replace(/\D/g, '');
  const conCodigoPais = digits.startsWith('58') ? digits : `58${digits.replace(/^0/, '')}`;
  return `https://wa.me/${conCodigoPais}`;
}

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
      include: { cancha: true, reserva: true, participantes: { include: { usuario: true }, orderBy: { createdAt: 'asc' } } },
    }),
    prisma.participantePartido.findMany({
      // Excluye los que ya abandonó (`SALIO`) — si se retiró, ya no tiene
      // sentido que siga apareciendo como "partido al que me uní".
      where: { usuarioId: sesion.usuarioId, estado: { not: 'SALIO' } },
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
        <CerrarSesion />
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
            {partidosCreados.map((p) => {
              const info = ESTADO_PARTIDO_LABEL[p.estado] ?? { texto: p.estado, tono: 'var(--pl-ink-soft)' };
              // Puede confirmar de nuevo si nunca reservó, o si la reserva
              // que tenía se canceló/expiró (el partido vuelve a COMPLETO
              // en ese caso — ver /api/reservas/[id]/cancelar).
              const puedeConfirmar = p.estado === 'COMPLETO' && (!p.reserva || ['CANCELADA', 'EXPIRADA'].includes(p.reserva.estado));
              const puedeCancelar =
                ['ABIERTO', 'COMPLETO'].includes(p.estado) && (!p.reserva || ['CANCELADA', 'EXPIRADA'].includes(p.reserva.estado));
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1.5px solid var(--pl-line)' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>
                      {DEPORTE_LABEL[p.deporte as Deporte]} · {p.cancha?.nombre ?? 'sin cancha asignada'}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
                      {p.inicio.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} · {p.cuposLlenos}/
                      {p.cuposTotales} cupos · nivel {NIVEL_LABEL[p.nivel] ?? p.nivel}
                    </p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: info.tono, marginTop: 2 }}>{info.texto}</p>
                    {p.reserva && !['CANCELADA', 'EXPIRADA'].includes(p.reserva.estado) ? (
                      <Link href={`/reservas/${p.reserva.id}/comprobante`} style={{ fontSize: 12 }}>
                        Ver reserva y pagar →
                      </Link>
                    ) : null}
                    {/* Para poder contactar a quien se unió — antes esta info
                        no aparecía por ningún lado, había que ver la base
                        directo. Solo los que de verdad se unieron (no cuenta al
                        organizador mismo ni a quien ya se retiró). */}
                    {p.participantes.filter((pp) => pp.usuarioId !== sesion.usuarioId && pp.estado !== 'SALIO').length > 0 ? (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.participantes
                          .filter((pp) => pp.usuarioId !== sesion.usuarioId && pp.estado !== 'SALIO')
                          .map((pp) => (
                            <a
                              key={pp.id}
                              href={linkWhatsapp(pp.usuario.telefono ?? '')}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                border: '1.5px solid var(--pl-line)',
                                borderRadius: 999,
                                padding: '3px 10px',
                                textDecoration: 'none',
                              }}
                            >
                              {pp.usuario.nombre} ↗
                            </a>
                          ))}
                      </div>
                    ) : null}
                  </div>
                  {puedeConfirmar || puedeCancelar ? (
                    <div style={{ flex: 'none', display: 'grid', gap: 8, justifyItems: 'end' }}>
                      {puedeConfirmar ? <ConfirmarPartido partidoId={p.id} /> : null}
                      {puedeCancelar ? <CancelarPartido partidoId={p.id} /> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {participaciones.length > 0 ? (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 17 }}>Partidos a los que me uní</h2>
          <div style={{ marginTop: 10 }}>
            {participaciones.map((pp) => (
              <div key={pp.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1.5px solid var(--pl-line)' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>
                    {DEPORTE_LABEL[pp.partido.deporte as Deporte]} · organiza {pp.partido.organizador.nombre}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
                    {pp.partido.inicio.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {pp.partido.cancha?.nombre ?? 'sin cancha asignada'} · nivel {NIVEL_LABEL[pp.partido.nivel] ?? pp.partido.nivel}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
                    {pp.partido.cuposLlenos}/{pp.partido.cuposTotales} jugadores · Bs{' '}
                    {Number(pp.partido.precioPorJugador).toLocaleString('es-VE')} c/u
                    {pp.partido.organizador.telefono ? (
                      <>
                        {' · '}
                        <a href={linkWhatsapp(pp.partido.organizador.telefono)} target="_blank" rel="noopener noreferrer">
                          WhatsApp del organizador
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-start' }}>
                  {pp.partido.estado === 'ABIERTO' ? (
                    <RetirarsePartido partidoId={pp.partido.id} />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: (ESTADO_PARTIDO_LABEL[pp.partido.estado] ?? { tono: 'var(--pl-ink-soft)' }).tono }}>
                      {(ESTADO_PARTIDO_LABEL[pp.partido.estado] ?? { texto: pp.partido.estado }).texto}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
