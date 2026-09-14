'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para esto.',
  sin_permiso: 'No tienes permiso para cambiar esto.',
};

/**
 * El % y la ventana de la oferta LAST_MINUTE (se dispara sola al cancelarse
 * una reserva confirmada dentro de esta ventana) — la oferta en sí sigue
 * siendo automática a propósito, pero estos dos números los decide el
 * admin, no quedan fijos en el código.
 */
export function ConfigLastMinute({ cancelacionHoras, descuentoLastMinutePct }: { cancelacionHoras: number; descuentoLastMinutePct: number }) {
  const router = useRouter();
  const [horas, setHoras] = useState(cancelacionHoras);
  const [pct, setPct] = useState(descuentoLastMinutePct);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setExito(false);
    try {
      const res = await fetch('/api/admin/sede', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ cancelacionHoras: horas, descuentoLastMinutePct: pct }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(MENSAJES[body.error] ?? 'No se pudo guardar.');
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
    <form onSubmit={guardar} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16, display: 'grid', gap: 12 }}>
      <div className="pl-form-grid-2" style={{ gap: 12 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Ventana antes del turno (horas)
          <input
            type="number"
            min={1}
            max={72}
            value={horas}
            onChange={(e) => setHoras(Number(e.target.value))}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Descuento (%)
          <input
            type="number"
            min={1}
            max={90}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
      </div>
      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: -6 }}>
        Si cancelan una reserva confirmada dentro de esta ventana antes del turno, esa hora se ofrece sola con este
        descuento a otros jugadores — para no perder la venta por completo.
      </p>
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      {exito ? (
        <Alert tone="ok" live>
          Guardado.
        </Alert>
      ) : null}
      <button className="pl-btn" type="submit" disabled={enviando} style={{ justifySelf: 'start' }}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
