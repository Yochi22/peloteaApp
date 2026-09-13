import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { DEPORTE_LABEL, DEPORTES, type Deporte } from '@pelotea/shared';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';

export const dynamic = 'force-dynamic';

// Reservas que de verdad ocupan el horario ese día — CANCELADA y EXPIRADA
// liberaron el cupo, así que no cuentan para "cuántas canchas quedan".
const ESTADOS_OCUPAN = ['PENDIENTE_PAGO', 'COMPROBANTE_ENVIADO', 'EN_REVISION', 'CONFIRMADA', 'COMPLETADA', 'NO_SHOW'] as const;

const ESTADO_LABEL: Record<string, { texto: string; tono: string }> = {
  PENDIENTE_PAGO: { texto: 'pendiente de pago', tono: 'var(--pl-warn)' },
  COMPROBANTE_ENVIADO: { texto: 'comprobante enviado', tono: 'var(--pl-warn)' },
  EN_REVISION: { texto: 'en revisión', tono: 'var(--pl-warn)' },
  CONFIRMADA: { texto: 'confirmada', tono: 'var(--pl-ok)' },
  COMPLETADA: { texto: 'jugada', tono: 'var(--pl-ink-soft)' },
  NO_SHOW: { texto: 'no llegó', tono: 'var(--pl-danger)' },
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

interface OcupanteVisible {
  reservaId: string;
  persona: string;
  esInvitado: boolean;
  telefono: string | null;
  estado: string;
  monto: number;
  esDividida: boolean;
}

export default async function AgendaPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; deporte?: string }>;
}) {
  await requireSesionPanel('/panel/agenda');
  const sede = await getSedeActiva();
  const { fecha: fechaRaw, deporte: deporteRaw } = await searchParams;

  const fechaValida = fechaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : fmtFecha(new Date());
  const diaInicio = new Date(`${fechaValida}T00:00:00`);
  const diaFin = new Date(diaInicio.getTime() + 24 * 60 * 60_000);
  const diaAnterior = fmtFecha(new Date(diaInicio.getTime() - 24 * 60 * 60_000));
  const diaSiguiente = fmtFecha(new Date(diaInicio.getTime() + 24 * 60 * 60_000));
  const diaSemana = diaInicio.getDay();

  const canchasSede = await prisma.cancha.findMany({ where: { sedeId: sede.id }, select: { deporte: true } });
  const deportesConCancha = DEPORTES.filter((d) => canchasSede.some((c) => c.deporte === d));
  const deporteFiltro = deporteRaw && (deportesConCancha as readonly string[]).includes(deporteRaw) ? deporteRaw : undefined;

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

  interface SlotAgenda {
    horaInicio: number;
    horaFin: number;
    ocupantes: OcupanteVisible[];
  }
  interface CanchaAgenda {
    id: string;
    nombre: string;
    deporte: string;
    cantidad: number;
    slots: SlotAgenda[];
  }

  const agenda: CanchaAgenda[] = canchas.map((c) => {
    const reservasCancha = reservasPorCancha.get(c.id) ?? [];
    const slots: SlotAgenda[] = [];
    for (const plantilla of c.plantillas) {
      for (let min = plantilla.horaInicio; min + c.duracionTurnoMin <= plantilla.horaFin; min += c.duracionTurnoMin) {
        const unidadInicio = new Date(diaInicio.getTime() + min * 60_000);
        const unidadFin = new Date(unidadInicio.getTime() + c.duracionTurnoMin * 60_000);
        const ocupantes: OcupanteVisible[] = reservasCancha
          .filter((r) => r.inicio < unidadFin && r.fin > unidadInicio)
          .map((r) => ({
            reservaId: r.id,
            persona: r.organizador.nombre,
            esInvitado: r.organizador.esInvitado,
            telefono: r.organizador.telefono,
            estado: r.estado,
            monto: Number(r.precioTotal),
            esDividida: r.esDividida,
          }));
        slots.push({ horaInicio: min, horaFin: min + c.duracionTurnoMin, ocupantes });
      }
    }
    return { id: c.id, nombre: c.nombre, deporte: c.deporte, cantidad: c.cantidad, slots };
  });

  const totalReservasDia = new Set(reservasDelDia.map((r) => r.id)).size;
  const canchasConHorario = agenda.filter((a) => a.slots.length > 0);
  const canchasSinHorario = agenda.length - canchasConHorario.length;

  // Agrupadas por deporte para no mezclar tipos distintos en una sola lista.
  const porDeporte = new Map<string, CanchaAgenda[]>();
  for (const a of canchasConHorario) {
    const lista = porDeporte.get(a.deporte) ?? [];
    lista.push(a);
    porDeporte.set(a.deporte, lista);
  }

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 900 }}>
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

      <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 18 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <Link
            href={`/panel/agenda?fecha=${diaAnterior}${deporteFiltro ? `&deporte=${deporteFiltro}` : ''}`}
            className="pl-btn pl-btn--ghost"
            style={{ textDecoration: 'none', padding: '9px 12px' }}
            aria-label="Día anterior"
          >
            ←
          </Link>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Fecha
            <input
              type="date"
              name="fecha"
              defaultValue={fechaValida}
              style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 13 }}
            />
          </label>
          <Link
            href={`/panel/agenda?fecha=${diaSiguiente}${deporteFiltro ? `&deporte=${deporteFiltro}` : ''}`}
            className="pl-btn pl-btn--ghost"
            style={{ textDecoration: 'none', padding: '9px 12px' }}
            aria-label="Día siguiente"
          >
            →
          </Link>
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
          Tipo de cancha
          <select name="deporte" defaultValue={deporteFiltro ?? ''} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 13 }}>
            <option value="">Todas</option>
            {deportesConCancha.map((d) => (
              <option key={d} value={d}>
                {DEPORTE_LABEL[d as Deporte]}
              </option>
            ))}
          </select>
        </label>
        <button className="pl-btn" type="submit" style={{ padding: '9px 16px' }}>
          Ver
        </button>
      </form>

      {canchasConHorario.length === 0 ? (
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 28 }}>
          Ninguna cancha tiene horario configurado para este día.
        </p>
      ) : (
        Array.from(porDeporte.entries()).map(([deporte, canchasDeporte]) => (
          <section key={deporte} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>{DEPORTE_LABEL[deporte as Deporte]}</h2>
            <div style={{ display: 'grid', gap: 18 }}>
              {canchasDeporte.map((c) => (
                <div key={c.id} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14, background: 'var(--pl-bg-raised)' }}>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>
                    {c.nombre}
                    {c.cantidad > 1 ? ` · ${c.cantidad} canchas` : ''}
                  </p>
                  <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                    {c.slots.map((s) => {
                      const libres = Math.max(0, c.cantidad - s.ocupantes.length);
                      const lleno = libres <= 0;
                      return (
                        <div
                          key={s.horaInicio}
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            padding: '6px 8px',
                            borderRadius: 8,
                            background: s.ocupantes.length > 0 ? 'var(--pl-bg-sunken)' : 'transparent',
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 700, flex: 'none', width: 92 }}>
                            {minutosAHora(s.horaInicio)}–{minutosAHora(s.horaFin)}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              flex: 'none',
                              padding: '2px 8px',
                              borderRadius: 999,
                              color: lleno ? 'var(--pl-danger)' : s.ocupantes.length > 0 ? 'var(--pl-warn)' : 'var(--pl-ok)',
                              border: `1.5px solid ${lleno ? 'var(--pl-danger)' : s.ocupantes.length > 0 ? 'var(--pl-warn)' : 'var(--pl-ok)'}`,
                            }}
                          >
                            {libres}/{c.cantidad} libres
                          </span>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {s.ocupantes.map((o) => {
                              const info = ESTADO_LABEL[o.estado] ?? { texto: o.estado, tono: 'var(--pl-ink-soft)' };
                              return (
                                <span
                                  key={o.reservaId}
                                  style={{ fontSize: 12, border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '3px 8px', background: 'var(--pl-bg-raised)' }}
                                >
                                  <Link href={`/panel/reservas/${o.reservaId}`} style={{ fontWeight: 600 }}>
                                    {o.persona}
                                  </Link>
                                  {o.esInvitado ? ' (invitado)' : ''}
                                  {o.esDividida ? ' · split' : ''}
                                  {' · Bs '}
                                  {o.monto.toLocaleString('es-VE')}
                                  {' · '}
                                  <span style={{ color: info.tono, fontWeight: 700 }}>{info.texto}</span>
                                  {o.telefono ? (
                                    <>
                                      {' · '}
                                      <a href={linkWhatsapp(o.telefono)} target="_blank" rel="noopener noreferrer">
                                        WhatsApp
                                      </a>
                                    </>
                                  ) : null}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
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
