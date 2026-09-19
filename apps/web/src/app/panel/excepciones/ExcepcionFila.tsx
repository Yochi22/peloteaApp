'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

const TIPO_LABEL: Record<string, string> = {
  CIERRE: 'Cierre / feriado',
  MANTENIMIENTO: 'Mantenimiento',
  TORNEO: 'Torneo',
  HORARIO_ESPECIAL: 'Horario especial',
};

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function minutosAHora(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface ExcepcionVisible {
  id: string;
  canchaNombre: string | null;
  fechaISO: string;
  tipo: string;
  horaInicio: number | null;
  horaFin: number | null;
  nota: string | null;
}

export function ExcepcionFila({ excepcion }: { excepcion: ExcepcionVisible }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  async function borrar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/excepciones/${excepcion.id}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo borrar.');
        return;
      }
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14 }}>
            {new Date(excepcion.fechaISO).toLocaleDateString('es-VE', { dateStyle: 'long' })} · {TIPO_LABEL[excepcion.tipo] ?? excepcion.tipo}
          </p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
            {excepcion.canchaNombre ?? 'Todas las canchas'} ·{' '}
            {excepcion.horaInicio == null ? 'Día completo' : `${minutosAHora(excepcion.horaInicio)}–${minutosAHora(excepcion.horaFin!)}`}
          </p>
          {excepcion.nota ? <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>{excepcion.nota}</p> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 'none' }}>
          {!confirmarBorrar ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrar(true)}
              style={{ fontSize: 12, color: 'var(--pl-danger)', background: 'none', border: 0, cursor: 'pointer', padding: '6px 4px' }}
            >
              Quitar
            </button>
          ) : (
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                disabled={enviando}
                onClick={borrar}
                style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--pl-danger)', border: 0, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
              >
                {enviando ? '…' : 'Sí, quitar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmarBorrar(false)}
                style={{ fontSize: 12, background: 'none', border: '1.5px solid var(--pl-line)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
              >
                No
              </button>
            </span>
          )}
        </div>
      </div>
      {error ? (
        <div style={{ marginTop: 8 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
