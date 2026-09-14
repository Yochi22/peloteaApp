import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { NuevaReglaDescuentoForm } from './NuevaReglaDescuentoForm';
import { ReglaDescuentoFila } from './ReglaDescuentoFila';
import { ConfigLastMinute } from './ConfigLastMinute';

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
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Recuperación de ingresos
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Descuentos</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Todo lo que da un descuento en Pelotea lo controlas tú: los programados de abajo (cancha, día, horario y %)
        los creas tú entero; el de última hora se dispara solo cuando cancelan (para no perder la venta), pero el %
        y con cuánta anticipación cuenta como "última hora" también los fijas tú, ahí mismo.
      </p>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>Última hora (por cancelación)</h2>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginBottom: 12 }}>
          Se dispara sola cuando cancelan una reserva ya confirmada — necesita reaccionar rápido para no perder la
          hora, así que no se programa como las de abajo, pero estos dos números sí los decides tú.
        </p>
        <ConfigLastMinute cancelacionHoras={sede.cancelacionHoras} descuentoLastMinutePct={sede.descuentoLastMinutePct} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>Programados</h2>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginBottom: 12 }}>
          Nunca aparecen solos: eliges cancha, día, horario y porcentaje — el sistema solo aplica lo que programaste.
        </p>
        {canchas.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14 }}>
            Todavía no hay ninguna cancha activa — crea una primero en /panel/canchas.
          </p>
        ) : (
          <NuevaReglaDescuentoForm canchas={canchas.map((c) => ({ id: c.id, nombre: c.nombre, deporte: c.deporte }))} />
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Reglas programadas creadas</h2>
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
