import { notFound, redirect } from 'next/navigation';
import { prisma } from '@pelotea/db';
import { BeneficiosCuenta } from '@pelotea/ui';
import { getSesionServer } from '@/lib/session-server';
import { puedeAccederReserva } from '@/lib/acceso-reserva';
import { ComprobanteForm } from './ComprobanteForm';
import { SplitResumen } from './SplitResumen';
import { CompletarCuentaForm } from './CompletarCuentaForm';
import { CancelarReserva } from './CancelarReserva';

export const dynamic = 'force-dynamic';

export default async function ComprobantePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  const sesion = await getSesionServer();

  const reserva = await prisma.reserva.findUnique({
    where: { id },
    include: { cancha: { include: { sede: true } }, cuotas: true, organizador: true },
  });
  if (!reserva) notFound();
  // Reservó como invitado (sin cuenta) → solo entra con el token de SU reserva.
  if (!puedeAccederReserva(sesion, reserva, token ?? null)) {
    redirect(sesion ? '/' : `/entrar?next=/reservas/${id}/comprobante`);
  }

  const cuotaOrganizador = reserva.cuotas.find((c) => c.esOrganizador);
  const esInvitadoSinCuenta = !sesion && reserva.organizador.esInvitado;

  // El abono no se devuelve si el cliente cancela (ver
  // /api/reservas/[id]/cancelar) — "algo ya pagado" decide qué advertencia
  // mostrar antes de cancelar. En split, alguna cuota puede estar pagada
  // aunque la Reserva siga en PENDIENTE_PAGO (no avanza hasta que TODAS se
  // aprueban), por eso no basta con mirar el estado de la Reserva sola.
  const algoYaPagado = reserva.esDividida
    ? reserva.cuotas.some((c) => c.estado === 'PAGADA' || c.estado === 'APROBADA')
    : reserva.estado !== 'PENDIENTE_PAGO';
  const esCancelable = ['PENDIENTE_PAGO', 'COMPROBANTE_ENVIADO', 'EN_REVISION', 'CONFIRMADA'].includes(reserva.estado);

  return (
    <main className="pl-container" style={{ maxWidth: 460, paddingBlock: 32 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        {reserva.esDividida ? 'Pago dividido' : 'Pago móvil'}
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>
        {reserva.cancha.sede.nombre} · {reserva.cancha.nombre}
      </h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 4 }}>
        {new Date(reserva.inicio).toLocaleString('es-VE', { dateStyle: 'full', timeStyle: 'short' })}
      </p>

      {!reserva.esDividida ? (
        <div style={{ marginTop: 20, border: '1.5px solid var(--pl-line)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>Banco</p>
          <p style={{ fontWeight: 600 }}>{reserva.cancha.sede.pagoMovilBanco ?? '—'}</p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>Cédula / RIF</p>
          <p style={{ fontWeight: 600 }}>{reserva.cancha.sede.pagoMovilCedulaRif ?? '—'}</p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>Teléfono</p>
          <p style={{ fontWeight: 600 }}>{reserva.cancha.sede.pagoMovilTelefono ?? '—'}</p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>Monto exacto a transferir</p>
          <p style={{ fontWeight: 700, color: 'var(--pl-clay-deep)' }}>Bs {Number(reserva.montoAbono).toLocaleString('es-VE')}</p>
          {reserva.monedaRef !== 'VES' ? (
            <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 4 }}>
              Este turno cuesta {reserva.monedaRef} {Number(reserva.precioTotalRef).toLocaleString('es-VE')} — tasa Bs{' '}
              {Number(reserva.tasaCambio).toLocaleString('es-VE')} por {reserva.monedaRef}, la del día que reservaste.
            </p>
          ) : null}
          <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 10 }}>
            Este abono no se devuelve si cancelas.
          </p>
          {Number(reserva.montoRestante) > 0 ? (
            <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>
              + Bs {Number(reserva.montoRestante).toLocaleString('es-VE')} al llegar a la cancha (efectivo o pago
              móvil, antes de que te entreguen la pelota).
            </p>
          ) : null}
        </div>
      ) : (
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 10 }}>
          Total Bs {Number(reserva.precioTotal).toLocaleString('es-VE')} entre {reserva.cuotas.length} personas. Cada
          quien paga por pago móvil con los datos del club.
        </p>
      )}

      {reserva.esDividida && cuotaOrganizador ? (
        <SplitResumen
          reservaId={reserva.id}
          cuotaOrganizadorId={cuotaOrganizador.id}
          reservaEstadoInicial={reserva.estado}
          holdExpiraEnISO={reserva.holdExpiraEn?.toISOString() ?? null}
          cuotas={reserva.cuotas.map((c) => ({
            id: c.id,
            monto: Number(c.monto),
            estado: c.estado,
            esOrganizador: c.esOrganizador,
            nombreInvitado: c.nombreInvitado,
            linkPago: c.inviteToken ? `${process.env.APP_BASE_URL ?? ''}/pagar/${c.inviteToken}` : null,
          }))}
        />
      ) : (
        <ComprobanteForm
          reservaId={reserva.id}
          estadoInicial={reserva.estado}
          holdExpiraEnISO={reserva.holdExpiraEn?.toISOString() ?? null}
          accessToken={reserva.accessToken}
        />
      )}

      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 12, marginTop: 22 }}>
        Un humano del club revisa cada comprobante antes de confirmar — subirlo no aprueba el pago
        automáticamente. Te avisamos por WhatsApp en cuanto lo revisen.
      </p>

      {esInvitadoSinCuenta && token ? (
        <div style={{ marginTop: 28, display: 'grid', gap: 16 }}>
          <BeneficiosCuenta titulo="Guarda esta reserva en una cuenta" />
          <CompletarCuentaForm
            reservaId={reserva.id}
            token={token}
            emailConocido={reserva.organizador.email}
            nombre={reserva.organizador.nombre}
          />
        </div>
      ) : null}

      {esCancelable ? (
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <CancelarReserva
            reservaId={reserva.id}
            accessToken={token ?? reserva.accessToken}
            algoYaPagado={algoYaPagado}
            montoAbono={Number(reserva.montoAbono)}
          />
        </div>
      ) : null}
    </main>
  );
}
