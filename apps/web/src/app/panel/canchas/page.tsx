import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';

export const dynamic = 'force-dynamic';

export default async function CanchasPanelPage() {
  await requireSesionPanel('/panel/canchas');
  const sede = await getSedeActiva();

  const canchas = await prisma.cancha.findMany({
    where: { sedeId: sede.id },
    orderBy: { orden: 'asc' },
    include: { _count: { select: { plantillas: true } } },
  });

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <Link href="/panel" style={{ fontSize: 13 }}>
        ← Panel
      </Link>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            Inventario
          </p>
          <h1 style={{ fontSize: 26, marginTop: 4 }}>Canchas</h1>
        </div>
        <Link href="/panel/canchas/nueva" className="pl-btn" style={{ textDecoration: 'none' }}>
          + Nueva cancha
        </Link>
      </div>

      {canchas.length === 0 ? (
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 24 }}>
          Todavía no hay ninguna cancha registrada. Crea la primera para empezar a recibir reservas.
        </p>
      ) : (
        <div style={{ marginTop: 20 }}>
          {canchas.map((c) => (
            <Link
              key={c.id}
              href={`/panel/canchas/${c.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 4px',
                borderBottom: '1.5px solid var(--pl-line)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div>
                <p style={{ fontWeight: 600, fontSize: 15 }}>{c.nombre}</p>
                <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
                  {DEPORTE_LABEL[c.deporte as Deporte]} · {c.techada ? 'techada' : 'al aire libre'} · cupo{' '}
                  {c.capacidad}
                  {c.cantidad > 1 ? ` · ${c.cantidad} canchas` : ''}
                  {c._count.plantillas === 0 ? ' · sin horario configurado' : ''}
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  color: c.activa ? 'var(--pl-ok)' : 'var(--pl-ink-soft)',
                  border: `1.5px solid ${c.activa ? 'var(--pl-ok)' : 'var(--pl-line)'}`,
                  flex: 'none',
                }}
              >
                {c.activa ? 'Activa' : 'Inactiva'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
