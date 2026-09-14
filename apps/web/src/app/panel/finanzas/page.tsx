import Link from 'next/link';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { calcularMetricas } from '@/lib/metricas';
import { calcularRangoPeriodo, PERIODO_LABEL, type Periodo } from '@/lib/periodo';
import { obtenerTasaVigente } from '@/lib/tasa-cambio';

export const dynamic = 'force-dynamic';

const PERIODOS: Periodo[] = ['hoy', 'semana', 'mes'];

export default async function FinanzasPanelPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireSesionPanel('/panel/finanzas');
  const sede = await getSedeActiva();
  const { periodo: periodoRaw } = await searchParams;
  const periodo: Periodo = PERIODOS.includes(periodoRaw as Periodo) ? (periodoRaw as Periodo) : 'hoy';
  const { desde, hasta } = calcularRangoPeriodo(periodo);

  const [metricas, tasaHoy] = await Promise.all([
    calcularMetricas(sede.id, desde, hasta),
    sede.precioMoneda !== 'VES' ? obtenerTasaVigente(sede.precioMoneda) : null,
  ]);

  const hayDivisa = metricas.monedaRef !== 'VES';

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <Link href="/panel" style={{ fontSize: 13 }}>
        ← Panel
      </Link>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Panel del club
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Finanzas — {PERIODO_LABEL[periodo]}</h1>
      {hayDivisa ? (
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
          El club fija tarifas en {metricas.monedaRef}, pero siempre cobra en bolívares al cambio del día — cada
          reserva ya guarda la tasa que se usó al momento de reservarse, así que el equivalente en{' '}
          {metricas.monedaRef} de abajo nunca se recalcula con la tasa de hoy (sería incorrecto para reservas
          viejas). {tasaHoy ? `Tasa de hoy: Bs ${Number(tasaHoy.tasaVES).toLocaleString('es-VE')} por ${metricas.monedaRef}.` : ''}
        </p>
      ) : null}

      <div className="pl-pill-row" style={{ marginTop: 16 }}>
        {PERIODOS.map((p) => (
          <Link key={p} href={`/panel/finanzas?periodo=${p}`} className={periodo === p ? 'pl-pill pl-pill--active' : 'pl-pill'}>
            {PERIODO_LABEL[p]}
          </Link>
        ))}
      </div>

      <section style={{ marginTop: 24, border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 18 }}>
        <h2 style={{ fontSize: 15 }}>Ingresos confirmados</h2>
        <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 4 }}>
          Incluye lo retenido de cancelaciones y no-shows — ese dinero no se devuelve, así que sigue siendo ingreso
          aunque la reserva ya no esté activa.
        </p>
        <p style={{ fontFamily: 'var(--pl-font-display)', fontWeight: 800, fontSize: 32, marginTop: 10 }}>
          Bs {metricas.ingresosConfirmados.toLocaleString('es-VE')}
        </p>
        {hayDivisa ? (
          <p style={{ fontSize: 15, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
            ≈ {metricas.monedaRef} {metricas.ingresosConfirmadosRef.toLocaleString('es-VE')}
          </p>
        ) : null}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            Ticket promedio
          </p>
          <p style={{ fontFamily: 'var(--pl-font-display)', fontWeight: 800, fontSize: 22, marginTop: 6 }}>
            Bs {metricas.ticketPromedio.toLocaleString('es-VE')}
          </p>
          {hayDivisa ? (
            <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
              ≈ {metricas.monedaRef} {metricas.ticketPromedioRef.toLocaleString('es-VE')}
            </p>
          ) : null}
        </div>
        <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            Recuperado por ofertas
          </p>
          <p style={{ fontFamily: 'var(--pl-font-display)', fontWeight: 800, fontSize: 22, marginTop: 6, color: 'var(--pl-ok)' }}>
            Bs {metricas.recuperadoOfertas.toLocaleString('es-VE')}
          </p>
        </div>
        <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            Horas reservadas
          </p>
          <p style={{ fontFamily: 'var(--pl-font-display)', fontWeight: 800, fontSize: 22, marginTop: 6 }}>{metricas.horasReservadas}</p>
        </div>
      </div>

      <p style={{ marginTop: 20 }}>
        <Link href="/panel/reservas" style={{ fontSize: 13 }}>
          Ver el detalle de cada reserva →
        </Link>
      </p>
    </main>
  );
}
