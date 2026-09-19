import { prisma } from '@pelotea/db';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { NuevaExcepcionForm } from './NuevaExcepcionForm';
import { ExcepcionFila } from './ExcepcionFila';

export const dynamic = 'force-dynamic';

export default async function ExcepcionesPanelPage() {
  await requireSesionPanel('/panel/excepciones');
  const sede = await getSedeActiva();

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const [canchas, excepciones] = await Promise.all([
    prisma.cancha.findMany({ where: { sedeId: sede.id, activa: true }, orderBy: { orden: 'asc' } }),
    prisma.excepcionHorario.findMany({
      where: { sedeId: sede.id, fecha: { gte: hoy } },
      orderBy: { fecha: 'asc' },
      include: { cancha: true },
    }),
  ]);

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Disponibilidad
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Cierres y excepciones</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Feriados, mantenimiento o torneos: bloquea una fecha (o una franja puntual) para que nadie pueda reservar
        ahí, sin tener que desactivar la cancha entera ni tocar su horario semanal.
      </p>

      <section style={{ marginTop: 24 }}>
        {canchas.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14 }}>
            Todavía no hay ninguna cancha activa — crea una primero en /panel/canchas.
          </p>
        ) : (
          <NuevaExcepcionForm canchas={canchas.map((c) => ({ id: c.id, nombre: c.nombre, deporte: c.deporte }))} />
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Próximas</h2>
        {excepciones.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13 }}>No hay ningún cierre ni excepción programada.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {excepciones.map((e) => (
              <ExcepcionFila
                key={e.id}
                excepcion={{
                  id: e.id,
                  canchaNombre: e.cancha?.nombre ?? null,
                  fechaISO: e.fecha.toISOString(),
                  tipo: e.tipo,
                  horaInicio: e.horaInicio,
                  horaFin: e.horaFin,
                  nota: e.nota,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
