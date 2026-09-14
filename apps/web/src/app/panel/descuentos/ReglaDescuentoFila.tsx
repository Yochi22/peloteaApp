'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

const DIA_LABEL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function minutosAHora(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface ReglaDescuentoVisible {
  id: string;
  canchaNombre: string;
  deporteLabel: string;
  diaSemana: number | null;
  horaInicio: number;
  horaFin: number;
  descuentoPct: number;
  activa: boolean;
  /** Cuántas ofertas ya materializadas de esta regla siguen activas y sin tomar. */
  ofertasActivas: number;
}

export function ReglaDescuentoFila({ regla }: { regla: ReglaDescuentoVisible }) {
  const router = useRouter();
  const [activa, setActiva] = useState(regla.activa);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  async function alternar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/descuentos/${regla.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ activa: !activa }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo actualizar.');
        return;
      }
      setActiva(!activa);
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  async function borrar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/descuentos/${regla.id}`, {
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
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14, opacity: activa ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14 }}>
            {regla.canchaNombre} · {regla.deporteLabel}
          </p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
            {regla.diaSemana === null ? 'Todos los días' : DIA_LABEL[regla.diaSemana]} · {minutosAHora(regla.horaInicio)}–
            {minutosAHora(regla.horaFin)} · -{regla.descuentoPct}%
          </p>
          <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
            {regla.ofertasActivas} oferta{regla.ofertasActivas === 1 ? '' : 's'} activa{regla.ofertasActivas === 1 ? '' : 's'} sin tomar
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 'none' }}>
          <button
            type="button"
            disabled={enviando}
            onClick={alternar}
            className="pl-btn pl-btn--ghost"
            style={{ padding: '6px 12px', fontSize: 12 }}
          >
            {activa ? 'Desactivar' : 'Activar'}
          </button>
          {!confirmarBorrar ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrar(true)}
              style={{ fontSize: 12, color: 'var(--pl-danger)', background: 'none', border: 0, cursor: 'pointer', padding: '6px 4px' }}
            >
              Borrar
            </button>
          ) : (
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                disabled={enviando}
                onClick={borrar}
                style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--pl-danger)', border: 0, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
              >
                {enviando ? '…' : 'Sí, borrar'}
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
