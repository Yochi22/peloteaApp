import { redirect } from 'next/navigation';
import { getSesionServer } from '@/lib/session-server';
import { Alert } from '@pelotea/ui';
import { Configurar2FA } from './Configurar2FA';

export const dynamic = 'force-dynamic';

export default async function Cuenta2FAPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; obligatorio?: string }>;
}) {
  const { next, obligatorio } = await searchParams;
  const sesion = await getSesionServer();
  if (!sesion) redirect(`/entrar?next=${encodeURIComponent(next ?? '/cuenta/2fa')}`);

  const esAdmin = sesion.rol !== 'JUGADOR';
  // Solo un `next` interno (empieza en "/") evita mandar a la gente fuera del sitio.
  const destinoSeguro = next && next.startsWith('/') ? next : null;
  const esBloqueoDuro = obligatorio === '1' && !sesion.twoFactorEnabled;

  return (
    <main className="pl-container" style={{ maxWidth: 420, paddingBlock: 40 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        Seguridad de la cuenta
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Verificación en dos pasos</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 8 }}>
        {esAdmin
          ? 'Obligatoria para roles de administración del club — protege el panel aunque alguien adivine tu contraseña.'
          : 'Le agrega una capa extra a tu cuenta: además de la contraseña, un código de 6 dígitos de tu teléfono.'}
      </p>

      {esBloqueoDuro ? (
        <div style={{ marginTop: 16 }}>
          <Alert tone="danger" title="Necesitas activarlo para entrar" live>
            Tu rol exige verificación en dos pasos. Actívala acá para poder acceder al panel.
          </Alert>
        </div>
      ) : null}

      <Configurar2FA activadaInicial={sesion.twoFactorEnabled} destino={destinoSeguro} />
    </main>
  );
}
