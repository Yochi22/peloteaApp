import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { NuevaReglaDescuentoForm } from './NuevaReglaDescuentoForm';
import { ReglaDescuentoFila } from './ReglaDescuentoFila';

export const dynamic = 'force-dynamic';

export default async function DescuentosPanelPage() {
  await requireSesionPanel('/panel/descuentos');
  const sede = await getSedeActiva();

  const [canchas, reglas] = await Promise.all([
    prisma.cancha.findMany({ where: { sedeId: sede.id, activa: true }, orderBy: { orden: 'asc' } }),
    prisma.reglaDescuento.findMany({
      where: { sedeId: sede.id },
      orderBy: { createdAt: 'desc' },
      include: { cancha: true, _count: { select: { ofertas: { where: { estado: 'ACTIVA' } } } } },
    }),
  ]);

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <Link href="/panel" style={{ fontSize: 13 }}>
        ← Panel
      </Link>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Recuperación de ingresos
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Descuentos programados</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Nunca aparecen solos: acá decides sobre qué cancha, qué día, qué horario y qué porcentaje — el sistema solo
        aplica lo que programaste. (Las ofertas de última hora por cancelación siguen siendo aparte, automáticas por
        diseño — esas sí necesitan reaccionar rápido para no perder la hora.)
      </p>

      {canchas.length === 0 ? (
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 24 }}>
          Todavía no hay ninguna cancha activa — crea una primero en /panel/canchas.
        </p>
      ) : (
        <div style={{ marginTop: 22 }}>
          <NuevaReglaDescuentoForm canchas={canchas.map((c) => ({ id: c.id, nombre: c.nombre, deporte: c.deporte }))} />
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Reglas creadas</h2>
        {reglas.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13 }}>Todavía no has programado ningún descuento.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {reglas.map((r) => (
              <ReglaDescuentoFila
                key={r.id}
                regla={{
                  id: r.id,
                  canchaNombre: r.cancha.nombre,
                  deporteLabel: DEPORTE_LABEL[r.cancha.deporte as Deporte],
                  diaSemana: r.diaSemana,
                  horaInicio: r.horaInicio,
                  horaFin: r.horaFin,
                  descuentoPct: r.descuentoPct,
                  activa: r.activa,
                  ofertasActivas: r._count.ofertas,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
