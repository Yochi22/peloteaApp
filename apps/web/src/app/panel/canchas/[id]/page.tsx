import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { obtenerTasaVigente } from '@/lib/tasa-cambio';
import { EditarCanchaForm } from './EditarCanchaForm';
import { HorarioEditor } from './HorarioEditor';

export const dynamic = 'force-dynamic';

const DEFAULT_DIA = { activa: false, horaInicio: 360, horaFin: 1380, precioBase: 0 };

export default async function EditarCanchaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSesionPanel('/panel/canchas');
  const { id } = await params;
  const sede = await getSedeActiva();

  const cancha = await prisma.cancha.findFirst({ where: { id, sedeId: sede.id } });
  if (!cancha) notFound();

  const plantillas = await prisma.plantillaHorario.findMany({
    where: { canchaId: id },
    orderBy: { id: 'asc' },
  });

  const dias = Array.from({ length: 7 }, (_, diaSemana) => {
    const fila = plantillas.find((p) => p.diaSemana === diaSemana);
    return fila
      ? { diaSemana, activa: fila.activa, horaInicio: fila.horaInicio, horaFin: fila.horaFin, precioBase: Number(fila.precioBase) }
      : { diaSemana, ...DEFAULT_DIA };
  });

  const tasa = sede.precioMoneda !== 'VES' ? await obtenerTasaVigente(sede.precioMoneda) : null;

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 560 }}>
      <Link href="/panel/canchas" style={{ fontSize: 13 }}>
        ← Canchas
      </Link>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Inventario
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>{cancha.nombre}</h1>

      <EditarCanchaForm
        cancha={{
          id: cancha.id,
          nombre: cancha.nombre,
          deporte: cancha.deporte,
          superficie: cancha.superficie,
          techada: cancha.techada,
          capacidad: cancha.capacidad,
          cantidad: cancha.cantidad,
          duracionTurnoMin: cancha.duracionTurnoMin,
          duracionMaximaMin: cancha.duracionMaximaMin,
          activa: cancha.activa,
        }}
      />

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1.5px solid var(--pl-line)' }}>
        <h2 style={{ fontSize: 18 }}>Horario disponible</h2>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 4 }}>
          Días y horas en que esta cancha se puede reservar, con la tarifa base de cada día por unidad de turno
          {cancha.duracionMaximaMin > cancha.duracionTurnoMin ? ` (${cancha.duracionTurnoMin} min)` : ''}, en{' '}
          {sede.precioMoneda === 'VES' ? 'bolívares' : sede.precioMoneda}
          {sede.precioMoneda !== 'VES' ? ' (la moneda con la que la sede fija tarifas — cámbiala en /panel/configuracion)' : ''}.
        </p>
        <HorarioEditor
          canchaId={cancha.id}
          diasIniciales={dias}
          monedaPrecio={sede.precioMoneda}
          tasaCambio={tasa ? Number(tasa.tasaVES) : null}
        />
      </div>
    </main>
  );
}
