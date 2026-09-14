import { prisma } from '@pelotea/db';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { antiguedadTasaDias } from '@/lib/tasa-cambio';
import { CargarTasa } from './CargarTasa';

export const dynamic = 'force-dynamic';

export default async function TasaCambioPage() {
  await requireSesionPanel('/panel/tasa-cambio');

  const sede = await getSedeActiva();
  const historial = await prisma.tasaCambio.findMany({
    where: { moneda: sede.precioMoneda },
    orderBy: { fecha: 'desc' },
    take: 14,
  });
  const vigente = historial[0] ?? null;
  const antiguedad = vigente ? antiguedadTasaDias(vigente.fecha) : null;

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 480 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Tasa de cambio
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>
        {sede.precioMoneda} → Bs
      </h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        El club fija sus tarifas en {sede.precioMoneda} y cobra en bolívares al cambio del día. La tasa se carga a
        mano — no hay ninguna conexión automática al BCV.
      </p>

      {sede.precioMoneda === 'VES' ? (
        <p style={{ marginTop: 20, fontSize: 13 }}>
          Esta sede fija precios directo en bolívares — no hay conversión que configurar.
        </p>
      ) : (
        <>
          <CargarTasa moneda={sede.precioMoneda} tasaActual={vigente ? Number(vigente.tasaVES) : null} />

          {vigente ? (
            <p style={{ fontSize: 12, color: antiguedad && antiguedad > 1 ? 'var(--pl-warn)' : 'var(--pl-ink-soft)', marginTop: 14 }}>
              Tasa vigente: Bs {Number(vigente.tasaVES).toLocaleString('es-VE')} por {sede.precioMoneda}, del{' '}
              {vigente.fecha.toLocaleDateString('es-VE')}
              {antiguedad && antiguedad > 1 ? ` (hace ${antiguedad} días — revisa si sigue vigente)` : ''}.
            </p>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--pl-warn)', marginTop: 14 }}>
              Todavía no hay ninguna tasa cargada — nadie puede reservar hasta que cargues una.
            </p>
          )}

          {historial.length > 1 ? (
            <div style={{ marginTop: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>Historial</p>
              <div style={{ marginTop: 8 }}>
                {historial.map((h) => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1.5px solid var(--pl-line)', fontSize: 13 }}>
                    <span style={{ color: 'var(--pl-ink-soft)' }}>{h.fecha.toLocaleDateString('es-VE')}</span>
                    <span>Bs {Number(h.tasaVES).toLocaleString('es-VE')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
