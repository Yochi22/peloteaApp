import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { BeneficiosCuenta } from '@pelotea/ui';
import { GuestPagoForm } from './GuestPagoForm';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[0-9a-fA-F-]{16,64}$/;

/**
 * Página pública para que un invitado del split pague SU parte sin crear
 * cuenta. Llega por un link (`/pagar/<token>`) que el organizador comparte.
 */
export default async function PagarInvitadoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  const cuota = await prisma.cuota.findUnique({
    where: { inviteToken: token },
    include: { reserva: { include: { cancha: { include: { sede: true } } } } },
  });
  if (!cuota) notFound();

  const { reserva } = cuota;

  return (
    <main className="pl-container" style={{ maxWidth: 460, paddingBlock: 32 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        Tu parte del partido
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>
        {reserva.cancha.sede.nombre} · {reserva.cancha.nombre}
      </h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 4 }}>
        {new Date(reserva.inicio).toLocaleString('es-VE', { dateStyle: 'full', timeStyle: 'short' })}
      </p>

      <div style={{ marginTop: 20, border: '1.5px solid var(--pl-line)', borderRadius: 12, padding: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>Tu parte a pagar</p>
        <p style={{ fontFamily: 'var(--pl-font-display)', fontWeight: 800, fontSize: 24 }}>
          Bs {Number(cuota.monto).toLocaleString('es-VE')}
        </p>
        <div style={{ borderTop: '1.5px dashed var(--pl-line)', marginTop: 14, paddingTop: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>Banco</p>
          <p style={{ fontWeight: 600 }}>{reserva.cancha.sede.pagoMovilBanco ?? '—'}</p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>Cédula / RIF</p>
          <p style={{ fontWeight: 600 }}>{reserva.cancha.sede.pagoMovilCedulaRif ?? '—'}</p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>Teléfono</p>
          <p style={{ fontWeight: 600 }}>{reserva.cancha.sede.pagoMovilTelefono ?? '—'}</p>
        </div>
      </div>

      <GuestPagoForm token={token} estadoInicial={cuota.estado} />

      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 12, marginTop: 18 }}>
        No necesitas crear una cuenta para pagar tu parte.
      </p>

      <div style={{ marginTop: 20 }}>
        <BeneficiosCuenta titulo="¿Jugaste y te gustó? Crea tu cuenta" />
      </div>
      <Link
        href="/registrarse"
        className="pl-btn"
        style={{ display: 'block', textAlign: 'center', marginTop: 12, textDecoration: 'none' }}
      >
        Crear cuenta gratis
      </Link>
    </main>
  );
}
