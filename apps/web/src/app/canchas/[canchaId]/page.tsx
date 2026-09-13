import { notFound } from 'next/navigation';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { slotsDisponibles } from '@/lib/disponibilidad';
import { getSesionServer } from '@/lib/session-server';
import { SlotPicker } from './SlotPicker';

export const dynamic = 'force-dynamic'; // disponibilidad cambia todo el tiempo

export default async function CanchaPage({ params }: { params: Promise<{ canchaId: string }> }) {
  const { canchaId } = await params;
  const cancha = await prisma.cancha.findUnique({ where: { id: canchaId }, include: { sede: true } });
  if (!cancha || !cancha.activa) notFound();

  const [disponibilidad, sesion] = await Promise.all([slotsDisponibles(cancha.id), getSesionServer()]);

  return (
    <main>
      <div
        className="pl-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          paddingBlock: 22,
          borderBottom: '1.5px solid var(--pl-line)',
        }}
      >
        <div
          style={{ width: 84, height: 56, borderRadius: 9, background: 'var(--pl-hard)', flex: 'none' }}
          aria-hidden
        />
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            {cancha.sede.nombre}
          </p>
          <h1 style={{ fontSize: 24, marginTop: 3 }}>{cancha.nombre}</h1>
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 3 }}>
            {DEPORTE_LABEL[cancha.deporte as Deporte]} · {cancha.techada ? 'techada' : 'al aire libre'} ·{' '}
            {cancha.duracionTurnoMin} min por turno
          </p>
        </div>
      </div>

      <div className="pl-container" style={{ paddingBlock: 24 }}>
        <SlotPicker
          canchaId={cancha.id}
          slots={disponibilidad.slots}
          monedaRef={disponibilidad.monedaRef}
          tasaCambio={disponibilidad.tasaCambio}
          fechaTasa={disponibilidad.fechaTasa}
          autenticado={!!sesion}
          duracionTurnoMin={cancha.duracionTurnoMin}
          politicaAbono={{
            activo: cancha.sede.pagoParcialActivo,
            duracionMinMin: cancha.sede.pagoParcialDuracionMinMin,
            horasAdelanto: cancha.sede.pagoParcialHorasAdelanto,
          }}
        />
      </div>
    </main>
  );
}
