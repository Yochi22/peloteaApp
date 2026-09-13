'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

const DIA_LABEL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export interface DiaHorario {
  diaSemana: number;
  activa: boolean;
  horaInicio: number;
  horaFin: number;
  precioBase: number;
}

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function minutosAHora(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function horaAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const MENSAJES: Record<string, string> = {
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para esto.',
  sin_permiso: 'No tienes permiso para editar el horario.',
  cancha_no_encontrada: 'Esta cancha ya no existe.',
};

export function HorarioEditor({
  canchaId,
  diasIniciales,
  monedaPrecio,
  tasaCambio,
}: {
  canchaId: string;
  diasIniciales: DiaHorario[];
  /** Moneda en la que se escribe `precioBase` (Sede.precioMoneda). 'VES' = ya está en bolívares. */
  monedaPrecio: string;
  /** Bs por unidad de `monedaPrecio`, del día. Null si no hay tasa cargada todavía. */
  tasaCambio: number | null;
}) {
  const hayConversion = monedaPrecio !== 'VES';
  const router = useRouter();
  const [dias, setDias] = useState(diasIniciales);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  function actualizarDia(diaSemana: number, cambios: Partial<DiaHorario>) {
    setDias((prev) => prev.map((d) => (d.diaSemana === diaSemana ? { ...d, ...cambios } : d)));
  }

  async function guardar() {
    setEnviando(true);
    setError(null);
    setExito(false);
    try {
      const res = await fetch(`/api/admin/canchas/${canchaId}/horario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ dias }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo guardar el horario.');
        return;
      }
      setExito(true);
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      {dias.map((d) => (
        <div
          key={d.diaSemana}
          style={{
            display: 'grid',
            gridTemplateColumns: hayConversion ? '18px 90px 1fr 1fr 90px 110px' : '18px 90px 1fr 1fr 90px',
            gap: 8,
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1.5px solid var(--pl-line)',
            opacity: d.activa ? 1 : 0.55,
          }}
        >
          <input
            type="checkbox"
            checked={d.activa}
            onChange={(e) => actualizarDia(d.diaSemana, { activa: e.target.checked })}
          />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{DIA_LABEL[d.diaSemana]}</span>
          <input
            type="time"
            value={minutosAHora(d.horaInicio)}
            disabled={!d.activa}
            onChange={(e) => actualizarDia(d.diaSemana, { horaInicio: horaAMinutos(e.target.value) })}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 7, font: 'inherit', fontSize: 13 }}
          />
          <input
            type="time"
            value={minutosAHora(d.horaFin === 1440 ? 0 : d.horaFin)}
            disabled={!d.activa}
            onChange={(e) => {
              const min = horaAMinutos(e.target.value);
              actualizarDia(d.diaSemana, { horaFin: min === 0 ? 1440 : min });
            }}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 7, font: 'inherit', fontSize: 13 }}
          />
          <input
            type="number"
            min={0}
            step={0.5}
            value={d.precioBase}
            disabled={!d.activa}
            title={hayConversion ? `Tarifa base en ${monedaPrecio}, por unidad de turno` : 'Tarifa base en Bs, por unidad de turno'}
            onChange={(e) => actualizarDia(d.diaSemana, { precioBase: Number(e.target.value) })}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 7, font: 'inherit', fontSize: 13 }}
          />
          {hayConversion ? (
            <span style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
              {tasaCambio ? `≈ Bs ${(d.precioBase * tasaCambio).toLocaleString('es-VE', { maximumFractionDigits: 0 })}` : 'sin tasa'}
            </span>
          ) : null}
        </div>
      ))}

      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 8 }}>
        Hora de apertura · hora de cierre · tarifa base{hayConversion ? ` en ${monedaPrecio}` : ' en Bs'} por unidad
        de turno{hayConversion ? ' · equivalente en Bs a la tasa de hoy' : ''}.
      </p>
      {hayConversion && !tasaCambio ? (
        <div style={{ marginTop: 10 }}>
          <Alert tone="warn" live>
            Todavía no hay tasa de cambio cargada — no se puede mostrar el equivalente en Bs. Cárgala en{' '}
            <a href="/panel/tasa-cambio">/panel/tasa-cambio</a>.
          </Alert>
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}
      {exito ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="ok" live>
            Horario guardado.
          </Alert>
        </div>
      ) : null}

      <button className="pl-btn" style={{ marginTop: 14 }} disabled={enviando} onClick={guardar}>
        {enviando ? 'Guardando…' : 'Guardar horario'}
      </button>
    </div>
  );
}
