'use client';

import { useMemo, useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { calcularAbono, type PoliticaAbono } from '@pelotea/shared';
import { Alert, BeneficiosCuenta } from '@pelotea/ui';
import type { SlotDisponible } from '@/lib/disponibilidad';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function formatoHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' });
}

const ESTILO_SLOT: Record<SlotDisponible['estado'], React.CSSProperties> = {
  libre: { border: '1.5px solid var(--pl-line)', background: 'var(--pl-bg-raised)' },
  ocupado: {
    border: '1.5px dashed var(--pl-line)',
    background:
      'repeating-linear-gradient(-45deg, var(--pl-bg-sunken), var(--pl-bg-sunken) 6px, var(--pl-bg-raised) 6px, var(--pl-bg-raised) 12px)',
    color: 'var(--pl-ink-soft)',
    cursor: 'not-allowed',
  },
  oferta: { border: '2px solid var(--pl-grass)', background: 'var(--pl-bg-raised)' },
  revision: { border: '1.5px dashed var(--pl-warn)', background: 'var(--pl-bg-raised)', color: 'var(--pl-warn)' },
};

export function SlotPicker({
  canchaId,
  slots,
  monedaRef,
  tasaCambio,
  fechaTasa,
  autenticado,
  duracionTurnoMin,
  politicaAbono,
  cantidadCancha,
}: {
  canchaId: string;
  slots: SlotDisponible[];
  /** Moneda en la que el club fija tarifas (Sede.precioMoneda). 'VES' = ya está en bolívares. */
  monedaRef: string;
  /** Bs por unidad de `monedaRef`. Null si el club no cargó ninguna tasa todavía. */
  tasaCambio: number | null;
  fechaTasa: string | null;
  /** false → mostramos los datos de invitado; reservar NO exige cuenta. */
  autenticado: boolean;
  duracionTurnoMin: number;
  politicaAbono: PoliticaAbono;
  /** Cancha.cantidad — solo si es > 1 mostramos "N libres" por horario (pool). */
  cantidadCancha: number;
}) {
  const hayConversion = monedaRef !== 'VES';
  const sinTasa = hayConversion && tasaCambio === null;
  const router = useRouter();
  const [diaIdx, setDiaIdx] = useState(0);
  const [seleccion, setSeleccion] = useState<SlotDisponible | null>(null);
  const [unidades, setUnidades] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitado, setInvitado] = useState({ nombre: '', telefono: '', email: '' });

  const dias = useMemo(() => {
    const claves = Array.from(new Set(slots.map((s) => s.inicioISO.slice(0, 10))));
    return claves.map((clave) => {
      const fecha = new Date(`${clave}T00:00:00`);
      return { clave, fecha, slots: slots.filter((s) => s.inicioISO.startsWith(clave)) };
    });
  }, [slots]);
  const porInicio = useMemo(() => new Map(slots.map((s) => [s.inicioISO, s])), [slots]);

  const diaActual = dias[diaIdx];

  // Duración elegida: precio sumado franja por franja (correcto si el rango
  // cruza de horario normal a peak) y fin real de la reserva.
  const bloque = useMemo(() => {
    if (!seleccion) return null;
    let precioTotal = 0;
    let precioTotalRef = 0;
    let hayRef = true;
    let fin = seleccion.finISO;
    let cursor: SlotDisponible | undefined = seleccion;
    for (let i = 0; i < unidades && cursor; i++) {
      precioTotal += cursor.precio;
      if (cursor.precioRef === null) hayRef = false;
      else precioTotalRef += cursor.precioRef;
      fin = cursor.finISO;
      cursor = porInicio.get(cursor.finISO);
    }
    return {
      precioTotal: Math.round(precioTotal * 100) / 100,
      precioTotalRef: hayRef ? Math.round(precioTotalRef * 100) / 100 : null,
      finISO: fin,
      duracionMin: unidades * duracionTurnoMin,
    };
  }, [seleccion, unidades, porInicio, duracionTurnoMin]);

  const abono = bloque ? calcularAbono(bloque.precioTotal, bloque.duracionMin, politicaAbono) : null;

  async function confirmar() {
    if (!seleccion || !bloque) return;
    if (sinTasa) {
      setError('El club todavía no cargó la tasa de cambio de hoy. Intenta más tarde.');
      return;
    }
    if (!autenticado && (invitado.nombre.trim().length < 2 || invitado.telefono.trim().length < 7)) {
      setError('Escribe tu nombre y tu número de teléfono para continuar.');
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          'x-csrf-token': leerCookie('pl_csrf') ?? '',
        },
        body: JSON.stringify({
          canchaId,
          inicioISO: seleccion.inicioISO,
          duracionMin: bloque.duracionMin,
          ...(!autenticado
            ? {
                invitado: {
                  nombre: invitado.nombre.trim(),
                  telefono: invitado.telefono.trim(),
                  ...(invitado.email.trim() ? { email: invitado.email.trim() } : {}),
                },
              }
            : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const mensajes: Record<string, string> = {
          slot_ocupado: 'Ese horario ya fue tomado. Elige otro.',
          rate_limited: 'Demasiados intentos. Espera un momento y vuelve a intentar.',
          faltan_datos_invitado: 'Escribe tu nombre y tu número de teléfono para continuar.',
          demasiadas_reservas_pendientes: 'Ya tienes una reserva sin pagar. Complétala o cancélala antes de crear otra.',
          sin_tasa_cambio: 'El club todavía no cargó la tasa de cambio de hoy. Intenta más tarde.',
        };
        setError(mensajes[body.error] ?? 'No se pudo crear la reserva. Intenta de nuevo.');
        return;
      }
      const destino = body.accessToken
        ? `/reservas/${body.id}/comprobante?token=${body.accessToken}`
        : `/reservas/${body.id}/comprobante`;
      router.push(destino);
    } catch {
      setError('Hubo un problema de conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (dias.length === 0) {
    return <Alert tone="info" title="Sin horarios disponibles">No hay turnos publicados para esta cancha en los próximos días.</Alert>;
  }

  return (
    <div className="pl-slot-layout">
      <div>
        <nav style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto' }} aria-label="Elegir día">
          {dias.map((d, i) => (
            <button
              key={d.clave}
              type="button"
              onClick={() => setDiaIdx(i)}
              style={{
                border: i === diaIdx ? '2px solid var(--pl-clay)' : '1.5px solid var(--pl-line)',
                background: i === diaIdx ? 'var(--pl-clay)' : 'var(--pl-bg-raised)',
                color: i === diaIdx ? '#fff' : 'var(--pl-ink)',
                borderRadius: 9,
                padding: '8px 14px',
                textAlign: 'center',
                minWidth: 56,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{DIAS[d.fecha.getDay()]}</div>
              <div style={{ fontWeight: 700 }}>{d.fecha.getDate()}</div>
            </button>
          ))}
        </nav>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
          {diaActual?.slots.map((s) => {
            const seleccionado = seleccion?.inicioISO === s.inicioISO;
            return (
              <button
                key={s.inicioISO}
                type="button"
                disabled={s.estado === 'ocupado'}
                onClick={() => {
                  setSeleccion(s);
                  setUnidades(1);
                  setError(null);
                }}
                style={{
                  ...(seleccionado
                    ? { border: '2px solid var(--pl-clay)', background: 'var(--pl-clay)', color: '#fff' }
                    : ESTILO_SLOT[s.estado]),
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  textAlign: 'left',
                  minHeight: 44,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.85 }}>
                  {formatoHora(s.inicioISO)} {s.estado === 'oferta' ? `· -${s.descuentoPct}%` : ''}
                </span>
                {cantidadCancha > 1 && s.estado !== 'ocupado' ? (
                  <span style={{ fontSize: 10, opacity: 0.75 }}>
                    {s.cuposLibres} de {cantidadCancha} libres
                  </span>
                ) : null}
                {s.estado === 'ocupado' ? (
                  <span>Ocupado</span>
                ) : hayConversion && s.precioRef !== null ? (
                  <span style={{ fontWeight: 700 }}>
                    {monedaRef} {s.precioRef.toLocaleString('es-VE')}
                    <span style={{ fontWeight: 500, opacity: 0.7 }}> · Bs {s.precio.toLocaleString('es-VE')}</span>
                  </span>
                ) : (
                  <span style={{ fontWeight: 700 }}>Bs {s.precio.toLocaleString('es-VE')}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="pl-slot-aside">
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
          Tu reserva
        </p>

        {seleccion && bloque ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }} role="group" aria-label="Duración">
              {Array.from({ length: seleccion.unidadesConsecutivas }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setUnidades(n)}
                  style={{
                    flex: 1,
                    border: unidades === n ? '2px solid var(--pl-clay)' : '1.5px solid var(--pl-line)',
                    background: unidades === n ? 'var(--pl-clay)' : 'var(--pl-bg-raised)',
                    color: unidades === n ? '#fff' : 'var(--pl-ink)',
                    borderRadius: 8,
                    padding: '8px 0',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {(n * duracionTurnoMin) / 60} h
                </button>
              ))}
            </div>

            <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 12, padding: 16 }}>
              <p style={{ fontWeight: 700 }}>{new Date(seleccion.inicioISO).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 4 }}>
                {formatoHora(seleccion.inicioISO)} – {formatoHora(bloque.finISO)}
              </p>
              <div style={{ borderTop: '1.5px dashed var(--pl-line)', marginTop: 14, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span>Total</span>
                <span style={{ textAlign: 'right' }}>
                  {hayConversion && bloque.precioTotalRef !== null ? (
                    <>
                      <strong style={{ fontFamily: 'var(--pl-font-display)', fontSize: 20 }}>
                        {monedaRef} {bloque.precioTotalRef.toLocaleString('es-VE')}
                      </strong>
                      <div style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>≈ Bs {bloque.precioTotal.toLocaleString('es-VE')}</div>
                    </>
                  ) : (
                    <strong style={{ fontFamily: 'var(--pl-font-display)', fontSize: 20 }}>Bs {bloque.precioTotal.toLocaleString('es-VE')}</strong>
                  )}
                </span>
              </div>
              {hayConversion ? (
                <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 6 }}>
                  {sinTasa
                    ? 'El club todavía no cargó la tasa de cambio de hoy.'
                    : `Tasa: Bs ${tasaCambio!.toLocaleString('es-VE')} por ${monedaRef} (${fechaTasa ? new Date(fechaTasa).toLocaleDateString('es-VE') : '—'}). Se paga en bolívares.`}
                </p>
              ) : null}

              {abono?.aplica ? (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1.5px dashed var(--pl-line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>Abonas ahora</span>
                    <strong>Bs {abono.montoAbono.toLocaleString('es-VE')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: 'var(--pl-ink-soft)' }}>
                    <span>Al llegar a la cancha</span>
                    <span>Bs {abono.montoRestante.toLocaleString('es-VE')}</span>
                  </div>
                </div>
              ) : null}
              <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 10 }}>
                {abono?.aplica ? 'El abono' : 'El pago'} no se devuelve si cancelas.
              </p>
            </div>

            {abono?.aplica ? (
              <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 10 }}>
                Por ser {bloque.duracionMin / 60} h o más, el club exige abonar por adelantado solo{' '}
                {politicaAbono.horasAdelanto === 1 ? '1 hora' : `${politicaAbono.horasAdelanto} horas`}; el
                resto se paga en efectivo o pago móvil al llegar, antes de que te entreguen la pelota.
              </p>
            ) : null}

            {!autenticado ? (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <BeneficiosCuenta variant="compact" />
                <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
                  Tu nombre
                  <input
                    value={invitado.nombre}
                    onChange={(e) => setInvitado({ ...invitado, nombre: e.target.value })}
                    style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
                  Tu teléfono
                  <input
                    placeholder="0414-1234567"
                    value={invitado.telefono}
                    onChange={(e) => setInvitado({ ...invitado, telefono: e.target.value })}
                    style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
                  />
                </label>
                <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
                  ¿Ya tienes cuenta?{' '}
                  <Link href={`/entrar?next=/canchas/${canchaId}`}>Inicia sesión</Link> para dividir el pago o
                  recibir ofertas.
                </p>
              </div>
            ) : null}

            {error ? (
              <div style={{ marginTop: 14 }}>
                <Alert tone="danger" live>
                  {error}
                </Alert>
              </div>
            ) : null}

            {sinTasa ? (
              <div style={{ marginTop: 14 }}>
                <Alert tone="warn" live>
                  El club todavía no cargó la tasa de cambio de hoy — no se puede reservar hasta que la actualicen.
                </Alert>
              </div>
            ) : null}

            <button className="pl-btn" style={{ width: '100%', marginTop: 16 }} disabled={enviando || sinTasa} onClick={confirmar}>
              {enviando ? 'Reservando…' : 'Continuar al pago'}
            </button>
            <p style={{ color: 'var(--pl-ink-soft)', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
              Apartamos la cancha 15 minutos mientras pagas.
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--pl-ink-soft)', marginTop: 12 }}>Elige un horario para ver el resumen.</p>
        )}
      </aside>
    </div>
  );
}
