import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { calcularMetricas } from '@/lib/metricas';
import { Heatmap } from './Heatmap';
import { ColaAprobacion, type PagoPendiente } from './ColaAprobacion';
import { PorCobrar, type PorCobrarItem } from './PorCobrar';
import { obtenerTasaVigente, antiguedadTasaDias } from '@/lib/tasa-cambio';
import { Alert } from '@pelotea/ui';
import { AutoRefresh } from './AutoRefresh';
import { CerrarSesion } from './CerrarSesion';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 8;
const DIAS_RANGO = 30;

export default async function PanelPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await requireSesionPanel('/panel');

  const sede = await getSedeActiva();
  const { pagina: paginaRaw } = await searchParams;
  const pagina = Math.max(1, Number(paginaRaw ?? 1) || 1);

  // `hasta` es el FIN del día de hoy, no "ahora mismo": con "ahora mismo",
  // una reserva ya CONFIRMADA (pagada y aprobada) para más tarde hoy
  // quedaba fuera de "ingresos confirmados" — ese ingreso ya está asegurado,
  // no depende de si el turno ya pasó o no. Antes esto hacía que una
  // reserva cancelada más temprano en el día SÍ contara (su `inicio` ya
  // había pasado) mientras una confirmada más tarde NO contara, dando un
  // total que no cuadraba con lo que se veía en /panel/reservas.
  const desde = new Date(Date.now() - DIAS_RANGO * 86_400_000);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date();
  hasta.setHours(23, 59, 59, 999);
  const tasa = sede.precioMoneda !== 'VES' ? await obtenerTasaVigente(sede.precioMoneda) : null;
  const tasaAntiguaODesactualizada = tasa ? antiguedadTasaDias(tasa.fecha) > 1 : sede.precioMoneda !== 'VES';

  const [metricas, totalPendientes, pendientesRaw, porCobrarRaw] = await Promise.all([
    calcularMetricas(sede.id, desde, hasta),
    prisma.pago.count({ where: { sedeId: sede.id, estado: 'EN_REVISION' } }),
    prisma.pago.findMany({
      where: { sedeId: sede.id, estado: 'EN_REVISION' },
      orderBy: { createdAt: 'asc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        reserva: { include: { cancha: true, organizador: true } },
        cuota: { include: { reserva: { include: { cancha: true } }, participante: true } },
      },
    }),
    prisma.reserva.findMany({
      where: { sedeId: sede.id, estado: 'CONFIRMADA', restanteCobrado: false, montoRestante: { gt: 0 } },
      orderBy: { inicio: 'asc' },
      take: 20,
      include: { cancha: true, organizador: true },
    }),
  ]);

  // Antes esto se generaba solo (al cancelar dentro de la ventana crítica) y
  // se despachaba por push/email, pero nadie del club podía verlas — la
  // única forma de saber que existían era mirar la base directo.
  const ofertasActivas = await prisma.oferta.findMany({
    where: { sedeId: sede.id, estado: 'ACTIVA', ventanaFin: { gt: new Date() } },
    orderBy: { ventanaFin: 'asc' },
    take: 10,
    include: { cancha: true },
  });

  const porCobrar: PorCobrarItem[] = porCobrarRaw.map((r) => ({
    reservaId: r.id,
    persona: r.organizador.nombre,
    cancha: r.cancha.nombre,
    inicio: r.inicio.toISOString(),
    montoRestante: Number(r.montoRestante),
  }));

  const pendientes: PagoPendiente[] = pendientesRaw.map((p) => {
    const esCuota = !!p.cuota;
    const reserva = p.reserva ?? p.cuota?.reserva ?? null;
    const persona = esCuota
      ? p.cuota?.participante?.nombre ?? p.cuota?.nombreInvitado ?? 'Invitado sin registrarse'
      : p.reserva?.organizador.nombre ?? '—';
    return {
      pagoId: p.id,
      cuotaId: p.cuotaId,
      monto: Number(p.monto),
      referencia: p.referencia,
      creadoEn: p.createdAt.toISOString(),
      persona,
      cancha: reserva?.cancha.nombre ?? '—',
      inicio: reserva?.inicio.toISOString() ?? null,
      esSplit: esCuota,
    };
  });

  const totalPaginas = Math.max(1, Math.ceil(totalPendientes / POR_PAGINA));

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 1100 }}>
      <AutoRefresh />
      {tasaAntiguaODesactualizada ? (
        <div style={{ marginBottom: 18 }}>
          <Alert
            tone={tasa ? 'warn' : 'danger'}
            title={tasa ? 'La tasa de cambio puede estar vieja' : `Falta cargar la tasa de ${sede.precioMoneda}`}
            action={<Link href="/panel/tasa-cambio">{tasa ? 'Revisar' : 'Cargar ahora'} →</Link>}
            live
          >
            {tasa
              ? `La última tasa cargada es del ${tasa.fecha.toLocaleDateString('es-VE')}.`
              : 'Nadie puede reservar (con pago en línea) hasta que se cargue.'}
          </Alert>
        </div>
      ) : null}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
          Panel del club
        </p>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>Últimos {DIAS_RANGO} días</h1>
      </div>

      {/* Grilla (no flex-wrap ad hoc): en mobile cada botón ocupa una celda
          de ancho garantizado en vez de amontonarse en una fila que
          obligaba a hacer zoom out para verla completa. */}
      <div className="pl-panel-actions" style={{ marginTop: 16 }}>
        <Link href="/panel/canchas" className="pl-btn" style={{ textDecoration: 'none', background: 'var(--pl-hard)' }}>
          Canchas
        </Link>
        <Link href="/panel/reservas" className="pl-btn" style={{ textDecoration: 'none', background: 'var(--pl-grass)' }}>
          Reservas
        </Link>
        <Link href="/panel/agenda" className="pl-btn" style={{ textDecoration: 'none', background: 'var(--pl-grass-deep)' }}>
          Agenda del día
        </Link>
        <Link href="/panel/tasa-cambio" className="pl-btn" style={{ textDecoration: 'none', background: 'var(--pl-clay)' }}>
          Tasa de cambio
        </Link>
        {/* Color fijo, NO `var(--pl-ink)`: ese token se invierte en modo
            oscuro (pasa de casi-negro a crema) pero el texto de `.pl-btn`
            queda blanco fijo — en modo oscuro quedaba texto blanco sobre
            fondo casi blanco, ilegible. */}
        <Link href="/panel/configuracion" className="pl-btn" style={{ textDecoration: 'none', background: '#1D1913' }}>
          Configuración
        </Link>
        <Link href="/panel/whatsapp" className="pl-btn" style={{ textDecoration: 'none', background: '#25D366' }}>
          WhatsApp
        </Link>
        <CerrarSesion />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 20 }}>
        <Kpi etiqueta="Ingresos confirmados" valor={`Bs ${metricas.ingresosConfirmados.toLocaleString('es-VE')}`} />
        <Kpi etiqueta="Horas reservadas" valor={metricas.horasReservadas.toLocaleString('es-VE')} />
        <Kpi etiqueta="Ocupación" valor={metricas.ocupacionPct !== null ? `${metricas.ocupacionPct}%` : '—'} />
        <Kpi etiqueta="No-shows" valor={String(metricas.noShows)} tono="danger" />
        <Kpi etiqueta="Tasa de cancelación" valor={`${metricas.tasaCancelacionPct}%`} />
        <Kpi etiqueta="Ticket promedio" valor={`Bs ${metricas.ticketPromedio.toLocaleString('es-VE')}`} />
        <Kpi etiqueta="Recuperado (ofertas)" valor={`Bs ${metricas.recuperadoOfertas.toLocaleString('es-VE')}`} tono="ok" />
      </div>

      <div className="pl-panel-split" style={{ marginTop: 22 }}>
        <div>
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>Mapa de calor — horas más vacías</h2>
          <Heatmap datos={metricas.heatmap} />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Cola de aprobación</h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pl-warn)' }}>{totalPendientes} pendiente{totalPendientes === 1 ? '' : 's'}</span>
          </div>
          <ColaAprobacion pendientes={pendientes} pagina={pagina} totalPaginas={totalPaginas} />
          <PorCobrar inicial={porCobrar} />

          {ofertasActivas.length > 0 ? (
            <div style={{ marginTop: 22 }}>
              <h2 style={{ fontSize: 17, marginBottom: 12 }}>Ofertas de última hora activas</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {ofertasActivas.map((o) => (
                  <div key={o.id} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 12 }}>
                    <p style={{ fontWeight: 700, fontSize: 14 }}>
                      {o.cancha.nombre} · -{o.descuentoPct}%
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
                      {o.inicioObjetivo.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} · Bs{' '}
                      {Number(o.precioFinal).toLocaleString('es-VE')} · {o.tomada}/{o.cupo} cupos
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--pl-warn)', marginTop: 2 }}>
                      Vence {o.ventanaFin.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Kpi({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: 'ok' | 'danger' }) {
  return (
    // `minWidth: 0`: sin esto, un número largo ("Bs 1.234.567") no se puede
    // achicar por debajo de su ancho de contenido — la celda de grid se
    // estira más allá de su `minmax(150px, 1fr)` y empuja TODA la página a
    // scroll horizontal en mobile ("grid blowout", un bug clásico de CSS
    // Grid). `overflowWrap` es el respaldo si aun así no entra.
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14, background: 'var(--pl-bg-raised)', minWidth: 0, overflowWrap: 'anywhere' }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>{etiqueta}</p>
      <p style={{ fontFamily: 'var(--pl-font-display)', fontWeight: 800, fontSize: 22, marginTop: 6, color: tono === 'danger' ? 'var(--pl-danger)' : tono === 'ok' ? 'var(--pl-ok)' : 'var(--pl-ink)' }}>
        {valor}
      </p>
    </div>
  );
}
