import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSesionServer } from '@/lib/session-server';
import { prisma } from '@pelotea/db';
import { getSedeActivaONull } from '@/lib/sede';
import { DEPORTE_LABEL, DEPORTES } from '@pelotea/shared';
import { CrearPartidoForm } from './CrearPartidoForm';

export const dynamic = 'force-dynamic';

export default async function CrearPartidoPage() {
  const sesion = await getSesionServer();
  if (!sesion) redirect('/entrar?next=/partidos/crear');

  const sede = await getSedeActivaONull();
  if (!sede) {
    return (
      <main className="pl-container" style={{ paddingBlock: 60, textAlign: 'center' }}>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 15 }}>
          Todavía no hay ningún club configurado en esta instancia. Vuelve pronto.
        </p>
      </main>
    );
  }
  const canchas = await prisma.cancha.findMany({ where: { sedeId: sede.id, activa: true }, orderBy: { orden: 'asc' } });

  return (
    <main className="pl-container" style={{ maxWidth: 480, paddingBlock: 32 }}>
      <Link href="/partidos" style={{ fontSize: 13 }}>
        ← Partidos
      </Link>
      <h1 style={{ fontSize: 26, marginTop: 14 }}>Crear partido abierto</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 6 }}>
        Elige cancha, fecha y cuántos faltan — el resto de la comunidad lo ve en /partidos.
      </p>
      <CrearPartidoForm
        canchas={canchas.map((c) => ({ id: c.id, nombre: c.nombre, deporte: c.deporte }))}
        deportes={DEPORTES.map((d) => ({ value: d, label: DEPORTE_LABEL[d] }))}
      />
    </main>
  );
}
