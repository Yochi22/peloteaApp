import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { ComprobanteInline } from './ComprobanteInline';
import { Cronometro } from '../../Cronometro';

export const dynamic = 'force-dynamic';

const ESTADO_PAGO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

const ESTADO_CUOTA_LABEL: Record<string, string> = {
  PENDIENTE: 'Sin pagar',
  PAGADA: 'Comprobante enviado',
  APROBADA: 'Pagada',
  VENCIDA: 'Vencida',
};

function waLink(telefono: string | null): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  const conCodigoPais = digits.startsWith('58') ? digits : `58${digits.replace(/^0/, '')}`;
  return `https://wa.me/${conCodigoPais}`;
}

function esExtensionPdf(key: string | null): boolean {
  return !!key && key.toLowerCase().endsWith('.pdf');
}

export default async function DetalleReservaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSesionPanel('/panel/reservas');
  const { id } = await params;
  const sede = await getSedeActiva();

  const reserva = await prisma.reserva.findFirst({
    where: { id, sedeId: sede.id },
    include: {
      cancha: true,
      organizador: true,
      pagos: { orderBy: { createdAt: 'asc' } },
      cuotas: {
        orderBy: { createdAt: 'asc' },
        include: { participante: true, pago: true },
      },
    },
  });
  if (!reserva) notFound();

  const wa = waLink(reserva.organizador.telefono);
  const totalPagado = reserva.pagos.filter((p) => p.estado === 'APROBADO').reduce((s, p) => s + Number(p.monto), 0);
  const faltaPorPagar = Math.max(0, Number(reserva.precioTotal) - totalPagado);
  // Antes no se veía en ningún lado cuántas horas se reservó — solo la
  // hora de inicio. Redondeado a un decimal por si algún día hay medias
  // horas (hoy siempre cae justo, pero no cuesta nada ser exacto).
  const duracionHoras = Math.round(((reserva.fin.getTime() - reserva.inicio.getTime()) / 3_600_000) * 10) / 10;
  // El cronómetro no tiene sentido en una reserva de un día ya pasado —
  // solo se muestra hoy/a futuro, o si ya se había iniciado (para poder
  // seguir viéndolo aunque cruce medianoche).
  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);
  const mostrarCronometro = reserva.estado === 'CONFIRMADA' && (reserva.inicio >= inicioDeHoy || !!reserva.tiempoIniciadoEn);

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 640 }}>
      <Link href="/panel/reservas" style={{ fontSize: 13 }}>
        ← Reservas
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            {reserva.cancha.nombre}
          </p>
          <h1 style={{ fontSize: 24, marginTop: 4 }}>
            {reserva.inicio.toLocaleString('es-VE', { dateStyle: 'full', timeStyle: 'short' })}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--pl-ink-soft)', marginTop: 4 }}>
            {reserva.inicio.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })} –{' '}
            {reserva.fin.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })} · {duracionHoras}{' '}
            {duracionHoras === 1 ? 'hora' : 'horas'}
          </p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: '1.5px solid var(--pl-line)' }}>
          {reserva.estado}
        </span>
      </div>

      {mostrarCronometro ? (
        <div style={{ marginTop: 14 }}>
          <Cronometro
            reservaId={reserva.id}
            inicio={reserva.inicio.toISOString()}
            fin={reserva.fin.toISOString()}
            tiempoIniciadoEn={reserva.tiempoIniciadoEn?.toISOString() ?? null}
          />
        </div>
      ) : null}

      {/* ── Organizador ─────────────────────────────────────────────── */}
      <section style={{ marginTop: 24, border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16 }}>
        <h2 style={{ fontSize: 15 }}>Organizador</h2>
        <p style={{ fontSize: 14, marginTop: 8 }}>
          {reserva.organizador.nombre}{' '}
          {reserva.organizador.esInvitado ? <span style={{ fontSize: 11, color: 'var(--pl-ink-soft)' }}>(invitado, sin cuenta)</span> : null}
        </p>
        <p style={{ fontSize: 13, color: 'var(--pl-ink-soft)', marginTop: 4 }}>
          Tel: {reserva.organizador.telefono ?? '—'}
          {wa ? (
            <>
              {' · '}
              <a href={wa} target="_blank" rel="noopener noreferrer">
                Abrir WhatsApp
              </a>
            </>
          ) : null}
        </p>
        {reserva.organizador.email ? (
          <p style={{ fontSize: 13, color: 'var(--pl-ink-soft)' }}>Email: {reserva.organizador.email}</p>
        ) : null}
      </section>

      {/* ── Dinero ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: 18, border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16 }}>
        <h2 style={{ fontSize: 15 }}>Pago</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 10, fontSize: 13 }}>
          <div>
            <p style={{ color: 'var(--pl-ink-soft)', fontSize: 11, textTransform: 'uppercase' }}>Total de la reserva</p>
            <p style={{ fontWeight: 700 }}>Bs {Number(reserva.precioTotal).toLocaleString('es-VE')}</p>
          </div>
          <div>
            <p style={{ color: 'var(--pl-ink-soft)', fontSize: 11, textTransform: 'uppercase' }}>Pagado (aprobado)</p>
            <p style={{ fontWeight: 700, color: 'var(--pl-ok)' }}>Bs {totalPagado.toLocaleString('es-VE')}</p>
          </div>
          <div>
            <p style={{ color: 'var(--pl-ink-soft)', fontSize: 11, textTransform: 'uppercase' }}>Falta por pagar</p>
            <p style={{ fontWeight: 700, color: faltaPorPagar > 0 ? 'var(--pl-warn)' : 'var(--pl-ok)' }}>
              Bs {faltaPorPagar.toLocaleString('es-VE')}
            </p>
          </div>
          <div>
            <p style={{ color: 'var(--pl-ink-soft)', fontSize: 11, textTransform: 'uppercase' }}>Resto cobrado en sitio</p>
            <p style={{ fontWeight: 700 }}>{reserva.restanteCobrado ? 'Sí' : Number(reserva.montoRestante) > 0 ? 'Todavía no' : 'No aplica'}</p>
          </div>
        </div>
        {reserva.monedaRef !== 'VES' ? (
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>
            Tarifa original: {reserva.monedaRef} {Number(reserva.precioTotalRef).toLocaleString('es-VE')} · tasa Bs{' '}
            {Number(reserva.tasaCambio).toLocaleString('es-VE')} por {reserva.monedaRef} (congelada al reservar).
          </p>
        ) : null}

        {reserva.estado === 'CANCELADA' ? (
          <p style={{ fontSize: 12, color: 'var(--pl-danger)', marginTop: 10 }}>
            Cancelada {reserva.canceladaEn?.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
            {reserva.motivoCancelacion ? ` — ${reserva.motivoCancelacion}` : ''}. El abono no se devuelve si canceló
            el cliente; si canceló el club, la devolución (si aplica) se coordina por fuera del sistema.
          </p>
        ) : null}

        {/* Comprobantes de esta reserva (no cubre los de las cuotas del split, ver abajo) */}
        {reserva.pagos.length > 0 ? (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            {reserva.pagos.map((p) => (
              <div key={p.id} style={{ borderTop: '1.5px dashed var(--pl-line)', paddingTop: 10 }}>
                <p style={{ fontSize: 13 }}>
                  Bs {Number(p.monto).toLocaleString('es-VE')} · {p.metodo} ·{' '}
                  <span style={{ fontWeight: 700 }}>{ESTADO_PAGO_LABEL[p.estado] ?? p.estado}</span>
                  {p.referencia ? ` · ref. ${p.referencia}` : ''}
                </p>
                {p.motivoRechazo ? (
                  <p style={{ fontSize: 12, color: 'var(--pl-danger)', marginTop: 2 }}>{p.motivoRechazo}</p>
                ) : null}
                {p.comprobanteKey ? (
                  <div style={{ marginTop: 6 }}>
                    <ComprobanteInline pagoId={p.id} esPdf={esExtensionPdf(p.comprobanteKey)} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--pl-ink-soft)', marginTop: 10 }}>Todavía no se ha subido ningún comprobante.</p>
        )}
      </section>

      {/* ── Split ────────────────────────────────────────────────────── */}
      {reserva.esDividida ? (
        <section style={{ marginTop: 18, border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16 }}>
          <h2 style={{ fontSize: 15 }}>
            Pago dividido — {reserva.cuotas.filter((c) => c.estado === 'APROBADA').length}/{reserva.cuotas.length} pagaron
          </h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {reserva.cuotas.map((c) => {
              const nombre = c.participante?.nombre ?? c.nombreInvitado ?? 'Invitado sin registrarse';
              const telCuota = c.participante?.telefono ?? null;
              const waCuota = waLink(telCuota);
              return (
                <div key={c.id} style={{ borderTop: '1.5px dashed var(--pl-line)', paddingTop: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>
                    {nombre} {c.esOrganizador ? <span style={{ fontWeight: 500, color: 'var(--pl-ink-soft)' }}>(organizador)</span> : null}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
                    Bs {Number(c.monto).toLocaleString('es-VE')} · {ESTADO_CUOTA_LABEL[c.estado] ?? c.estado}
                    {telCuota ? ` · ${telCuota}` : ''}
                    {waCuota ? (
                      <>
                        {' · '}
                        <a href={waCuota} target="_blank" rel="noopener noreferrer">
                          WhatsApp
                        </a>
                      </>
                    ) : null}
                  </p>
                  {c.pago?.comprobanteKey ? (
                    <div style={{ marginTop: 6 }}>
                      <ComprobanteInline pagoId={c.pago.id} esPdf={esExtensionPdf(c.pago.comprobanteKey)} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
