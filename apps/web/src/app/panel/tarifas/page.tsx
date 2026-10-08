import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { NuevaReglaPrecioForm } from './NuevaReglaPrecioForm';
import { ReglaPrecioFila } from './ReglaPrecioFila';

export const dynamic = 'force-dynamic';

export default async function TarifasPanelPage() {
  await requireSesionPanel('/panel/tarifas');
  const sede = await getSedeActiva();

  const [canchas, reglas] = await Promise.all([
    prisma.cancha.findMany({ where: { sedeId: sede.id, activa: true }, orderBy: { orden: 'asc' } }),
    prisma.reglaPrecio.findMany({
      where: { sedeId: sede.id },
      orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
      include: { cancha: true },
    }),
  ]);

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Precios
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Tarifas por franja</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Recargos (ej. +25% en horario peak) o descuentos (ej. -15% fuera de horario pico) sobre el precio base de
        una cancha, por día y franja horaria. Si varias reglas aplican a la misma hora, se suman todas — no es "la
        que gana".
      </p>

      <section style={{ marginTop: 24 }}>
        {canchas.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14 }}>
            Todavía no hay ninguna cancha activa — crea una primero en /panel/canchas.
          </p>
        ) : (
          <NuevaReglaPrecioForm canchas={canchas.map((c) => ({ id: c.id, nombre: c.nombre, deporte: c.deporte }))} />
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Reglas creadas</h2>
        {reglas.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13 }}>Todavía no has creado ninguna regla de precio.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {reglas.map((r) => (
              <ReglaPrecioFila
                key={r.id}
                regla={{
                  id: r.id,
                  canchaNombre: r.cancha ? r.cancha.nombre : null,
                  deporteLabel: r.cancha ? DEPORTE_LABEL[r.cancha.deporte as Deporte] : null,
                  nombre: r.nombre,
                  diaSemana: r.diaSemana,
                  horaDesde: r.horaDesde,
                  horaHasta: r.horaHasta,
                  tipoModificador: r.tipoModificador,
                  valor: Number(r.valor),
                  prioridad: r.prioridad,
                  activa: r.activa,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
