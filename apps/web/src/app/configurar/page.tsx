import { redirect } from 'next/navigation';
import { getSedeActivaONull } from '@/lib/sede';
import { ConfigurarClubForm } from './ConfigurarClubForm';

export const dynamic = 'force-dynamic';

export default async function ConfigurarPage() {
  const sede = await getSedeActivaONull();
  // Ya se configuró antes — esta pantalla no vuelve a estar disponible
  // (ver /api/setup: solo crea la Sede la primera vez).
  if (sede) redirect('/entrar');

  return (
    <main className="pl-container" style={{ maxWidth: 460, paddingBlock: 40 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        Primera vez por acá
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Configura tu club</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 8 }}>
        Crea tu complejo y tu cuenta de administrador. Todo lo demás — canchas, horarios, tarifas, moneda — se
        configura después desde el panel.
      </p>

      <ConfigurarClubForm />
    </main>
  );
}
