import Link from 'next/link';
import { requireSesionPanel } from '@/lib/panel-guard';
import { NuevaCanchaForm } from './NuevaCanchaForm';

export const dynamic = 'force-dynamic';

export default async function NuevaCanchaPage() {
  await requireSesionPanel('/panel/canchas/nueva');

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 480 }}>
      <Link href="/panel/canchas" style={{ fontSize: 13 }}>
        ← Canchas
      </Link>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Inventario
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Nueva cancha</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Nace sin horario configurado — no acepta reservas hasta que le asignes días y horas disponibles.
      </p>

      <NuevaCanchaForm />
    </main>
  );
}
