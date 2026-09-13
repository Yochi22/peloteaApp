import { Fragment } from 'react';
import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, DEPORTES, type Deporte } from '@pelotea/shared';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { CobrarRestanteInline } from './CobrarRestanteInline';
import { FechaPicker } from './FechaPicker';

export const dynamic = 'force-dynamic';

// Reservas que de verdad ocupan el horario ese día — CANCELADA y EXPIRADA
// liberaron el cupo, así que no cuentan para "cuántas canchas quedan".
const ESTADOS_OCUPAN = ['PENDIENTE_PAGO', 'COMPROBANTE_ENVIADO', 'EN_REVISION', 'CONFIRMADA', 'COMPLETADA', 'NO_SHOW'] as const;

const ESTADO_INFO: Record<string, { texto: string; tono: string; bg: string }> = {
  PENDIENTE_PAGO: { texto: 'pendiente de pago', tono: 'var(--pl-warn)', bg: 'var(--pl-warn-bg)' },
  COMPROBANTE_ENVIADO: { texto: 'comprobante enviado', tono: 'var(--pl-warn)', bg: 'var(--pl-warn-bg)' },
  EN_REVISION: { texto: 'en revisión', tono: 'var(--pl-warn)', bg: 'var(--pl-warn-bg)' },
  CONFIRMADA: { texto: 'confirmada', tono: 'var(--pl-ok)', bg: 'var(--pl-ok-bg)' },
  COMPLETADA: { texto: 'jugada', tono: 'var(--pl-ink-soft)', bg: 'var(--pl-bg-sunken)' },
  NO_SHOW: { texto: 'no llegó', tono: 'var(--pl-danger)', bg: 'var(--pl-danger-bg)' },
};

function minutosAHora(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Mismo criterio que `formatoJid()` del worker: normaliza a wa.me/58<número sin el 0>. */
function linkWhatsapp(telefonoVe: string): string {
  const digits = telefonoVe.replace(/\D/g, '');
  const conCodigoPais = digits.startsWith('58') ? digits : `58${digits.replace(/^0/, '')}`;
  return `https://wa.me/${conCodigoPais}`;
}

interface Ocupante {
  reservaId: string;
  persona: string;
  esInvitado: boolean;
  telefono: string | null;
  estado: string;
  monto: number;
  esDividida: boolean;
  montoRestante: number;
  restanteCobrado: boolean;
  inicio: Date;
  fin: Date;
}

export default async function AgendaPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; deporte?: string }>;
}) {
  await requireSesionPanel('/panel/agenda');
  const sede = await getSedeActiva();
  const { fecha: fechaRaw, deporte: deporteRaw } = await searchParams;

  const hoy = fmtFecha(new Date());
  const fechaValida = fechaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : hoy;
  const diaInicio = new Date(`${fechaValida}T00:00:00`);
  const diaFin = new Date(diaInicio.getTime() + 24 * 60 * 60_000);
  const diaAnterior = fmtFecha(new Date(diaInicio.getTime() - 24 * 60 * 60_000));
  const diaSiguiente = fmtFecha(new Date(diaInicio.getTime() + 24 * 60 * 60_000));
  const manana = fmtFecha(new Date(new Date(`${hoy}T00:00:00`).getTime() + 24 * 60 * 60_000));
  const diaSemana = diaInicio.getDay();

  const canchasSede = await prisma.cancha.findMany({ where: { sedeId: sede.id }, select: { deporte: true } });
  const deportesConCancha = DEPORTES.filter((d) => canchasSede.some((c) => c.deporte === d));
  const deporteFiltro = deporteRaw && (deportesConCancha as readonly string[]).includes(deporteRaw) ? deporteRaw : undefined;

  const qs = (fecha: string) => `/panel/agenda?fecha=${fecha}${deporteFiltro ? `&deporte=${deporteFiltro}` : ''}`;

  const canchas = await prisma.cancha.findMany({
    where: { sedeId: sede.id, activa: true, ...(deporteFiltro ? { deporte: deporteFiltro as Deporte } : {}) },
    orderBy: [{ deporte: 'asc' }, { orden: 'asc' }],
    include: { plantillas: { where: { diaSemana, activa: true }, orderBy: { horaInicio: 'asc' } } },
  });

  const reservasDelDia = await prisma.reserva.findMany({
    where: {
      sedeId: sede.id,
      canchaId: { in: canchas.map((c) => c.id) },
      inicio: { lt: diaFin },
      fin: { gt: diaInicio },
      estado: { in: [...ESTADOS_OCUPAN] },
    },
    orderBy: { inicio: 'asc' },
    include: { organizador: true },
  });

  const reservasPorCancha = new Map<string, typeof reservasDelDia>();
  for (const r of reservasDelDia) {
    const lista = reservasPorCancha.get(r.canchaId) ?? [];
    lista.push(r);
    reservasPorCancha.set(r.canchaId, lista);
  }

  interface CanchaAgenda {
    id: string;
    nombre: string;
    deporte: string;
    cantidad: number;
    columnas: number;
    horas: Array<{ min: number; ocupantesPorColumna: Array<Ocupante | null> }>;
  }

  const agenda: CanchaAgenda[] = canchas.map((c) => {
    const reservasCancha = (reservasPorCancha.get(c.id) ?? []).map(
      (r): Ocupante => ({
        reservaId: r.id,
        persona: r.organizador.nombre,
        esInvitado: r.organizador.esInvitado,
        telefono: r.organizador.telefono,
        estado: r.estado,
        monto: Number(r.precioTotal),
        esDividida: r.esDividida,
        montoRestante: Number(r.montoRestante),
        restanteCobrado: r.restanteCobrado,
        inicio: r.inicio,
        fin: r.fin,
      }),
    );

    // Le asigna a cada reserva una columna estable para TODO el día (no por
    // franja) — mismo algoritmo que un calendario tipo Google Calendar para
    // eventos solapados: cada reserva toma la primera columna que ya quedó
    // libre a esa hora, o abre una nueva. Sin esto, la misma persona podía
    // "saltar" de columna entre una hora y la siguiente en una reserva de
    // 2h+, dando una grilla que se ve inconsistente.
    const finPorColumna: Date[] = [];
    const columnaPorReserva = new Map<string, number>();
    for (const r of reservasCancha) {
      let idx = finPorColumna.findIndex((fin) => fin <= r.inicio);
      if (idx === -1) {
        idx = finPorColumna.length;
        finPorColumna.push(r.fin);
      } else {
        finPorColumna[idx] = r.fin;
      }
      columnaPorReserva.set(r.reservaId, idx);
    }
    // Nunca menos columnas que `cantidad` (para que el pool completo se vea
    // aunque esté vacío), pero tampoco menos de las que de verdad hacen
    // falta si por algún caso raro hay más solapadas que `cantidad`.
    const columnas = Math.max(c.cantidad, finPorColumna.length);

    const minutosUnicos = new Set<number>();
    for (const plantilla of c.plantillas) {
      for (let min = plantilla.horaInicio; min + c.duracionTurnoMin <= plantilla.horaFin; min += c.duracionTurnoMin) {
        minutosUnicos.add(min);
      }
    }
    const horas = Array.from(minutosUnicos)
      .sort((a, b) => a - b)
      .map((min) => {
        const unidadInicio = new Date(diaInicio.getTime() + min * 60_000);
        const unidadFin = new Date(unidadInicio.getTime() + c.duracionTurnoMin * 60_000);
        const ocupantesPorColumna: Array<Ocupante | null> = Array.from({ length: columnas }, () => null);
        for (const r of reservasCancha) {
          if (r.inicio < unidadFin && r.fin > unidadInicio) {
            ocupantesPorColumna[columnaPorReserva.get(r.reservaId)!] = r;
          }
        }
        return { min, ocupantesPorColumna };
      });

    return { id: c.id, nombre: c.nombre, deporte: c.deporte, cantidad: c.cantidad, columnas, horas };
  });

  const totalReservasDia = new Set(reservasDelDia.map((r) => r.id)).size;
  const canchasConHorario = agenda.filter((a) => a.horas.length > 0);
  const canchasSinHorario = agenda.length - canchasConHorario.length;

  // Agrupadas por deporte para no mezclar tipos distintos en una sola sección.
  const porDeporte = new Map<string, CanchaAgenda[]>();
  for (const a of canchasConHorario) {
    const lista = porDeporte.get(a.deporte) ?? [];
    lista.push(a);
    porDeporte.set(a.deporte, lista);
  }

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 1100 }}>
      <Link href="/panel" style={{ fontSize: 13 }}>
        ← Panel
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
            Agenda del día
          </p>
          <h1 style={{ fontSize: 26, marginTop: 4 }}>
            {diaInicio.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
        </div>
        <Link href="/panel/reservas" className="pl-btn pl-btn--ghost" style={{ textDecoration: 'none' }}>
          Ver lista completa →
        </Link>
      </div>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        {totalReservasDia} reserva{totalReservasDia === 1 ? '' : 's'} este día · {canchasConHorario.length} tipo
        {canchasConHorario.length === 1 ? '' : 's'} de cancha con horario configurado
        {canchasSinHorario > 0 ? ` · ${canchasSinHorario} sin horario ese día` : ''}
      </p>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <div className="pl-pill-row">
          <Link href={qs(diaAnterior)} className="pl-pill pl-pill--icon" aria-label="Día anterior">
            ‹
          </Link>
          <Link href={qs(hoy)} className={fechaValida === hoy ? 'pl-pill pl-pill--active' : 'pl-pill'}>
            Hoy
          </Link>
          <Link href={qs(manana)} className={fechaValida === manana ? 'pl-pill pl-pill--active' : 'pl-pill'}>
            Mañana
          </Link>
          <FechaPicker fecha={fechaValida} deporte={deporteFiltro} />
          <Link href={qs(diaSiguiente)} className="pl-pill pl-pill--icon" aria-label="Día siguiente">
            ›
          </Link>
        </div>
        {deportesConCancha.length > 1 ? (
          <div className="pl-pill-row">
            <Link href={qs(fechaValida)} className={!deporteFiltro ? 'pl-pill pl-pill--active' : 'pl-pill'}>
              Todas
            </Link>
            {deportesConCancha.map((d) => (
              <Link
                key={d}
                href={`/panel/agenda?fecha=${fechaValida}&deporte=${d}`}
                className={deporteFiltro === d ? 'pl-pill pl-pill--active' : 'pl-pill'}
              >
                {DEPORTE_LABEL[d as Deporte]}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {canchasConHorario.length === 0 ? (
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 28 }}>
          Ninguna cancha tiene horario configurado para este día.
        </p>
      ) : (
        Array.from(porDeporte.entries()).map(([deporte, canchasDeporte]) => (
          <section key={deporte} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>{DEPORTE_LABEL[deporte as Deporte]}</h2>
            {/* `gridTemplateColumns: minmax(0, 1fr)` explícito: sin piso en 0,
                el ancho mínimo propio de la grilla de cada cancha (para su
                scroll horizontal interno) puede empujar esta columna más
                allá del viewport en mobile — mismo bug que el heatmap. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24 }}>
              {canchasDeporte.map((c) => (
                <div key={c.id}>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>
                    {c.nombre}
                    {c.cantidad > 1 ? ` · ${c.cantidad} canchas` : ''}
                  </p>
                  {c.cantidad > 1 ? (
                    <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
                      Cada columna es un cupo del pool, no una cancha física fija — se asigna cuál es cuál al llegar.
                    </p>
                  ) : null}
                  <div className="pl-scroll-x" style={{ marginTop: 10 }}>
                    <div
                      className="pl-agenda-grid"
                      style={{ gridTemplateColumns: `72px repeat(${c.columnas}, 152px)` }}
                    >
                      <span className="pl-agenda-head" />
                      {Array.from({ length: c.columnas }, (_, i) => (
                        <span key={i} className="pl-agenda-head">
                          Cupo {i + 1}
                        </span>
                      ))}

                      {c.horas.map((h) => (
                        <Fragment key={h.min}>
                          <div className="pl-agenda-hora">
                            {minutosAHora(h.min)}
                          </div>
                          {h.ocupantesPorColumna.map((o, i) => {
                            if (!o) {
                              return (
                                <div key={i} className="pl-agenda-cell pl-agenda-cell--libre">
                                  Libre
                                </div>
                              );
                            }
                            const info = ESTADO_INFO[o.estado] ?? { texto: o.estado, tono: 'var(--pl-ink-soft)', bg: 'var(--pl-bg-sunken)' };
                            return (
                              <div key={i} className="pl-agenda-cell" style={{ background: info.bg, borderColor: info.tono }}>
                                <Link href={`/panel/reservas/${o.reservaId}`} style={{ fontWeight: 700, fontSize: 12.5 }}>
                                  {o.persona}
                                </Link>
                                <span style={{ fontWeight: 700, color: info.tono, fontSize: 11 }}>{info.texto}</span>
                                <span style={{ color: 'var(--pl-ink-soft)' }}>
                                  Bs {o.monto.toLocaleString('es-VE')}
                                  {o.esInvitado ? ' · invitado' : ''}
                                  {o.esDividida ? ' · split' : ''}
                                </span>
                                {o.telefono ? (
                                  <a href={linkWhatsapp(o.telefono)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
                                    WhatsApp
                                  </a>
                                ) : null}
                                {(o.estado === 'CONFIRMADA' || o.estado === 'COMPLETADA') && !o.restanteCobrado && o.montoRestante > 0 ? (
                                  <CobrarRestanteInline reservaId={o.reservaId} montoRestante={o.montoRestante} />
                                ) : null}
                              </div>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
