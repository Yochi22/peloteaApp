'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function CargarTasa({ moneda, tasaActual }: { moneda: string; tasaActual: number | null }) {
  const router = useRouter();
  const [tasa, setTasa] = useState(tasaActual ?? 0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tasa <= 0) return;
    setEnviando(true);
    setError(null);
    setExito(false);
    try {
      const res = await fetch('/api/admin/tasa-cambio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ moneda, tasaVES: tasa }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo guardar la tasa.');
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
    <div style={{ marginTop: 20 }}>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600, flex: 1 }}>
          Bs por {moneda} — hoy
          <input
            type="number"
            step="0.01"
            min={0.01}
            value={tasa || ''}
            onChange={(e) => setTasa(Number(e.target.value))}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
        <button className="pl-btn" type="submit" disabled={enviando} style={{ width: 'auto', padding: '10px 18px' }}>
          {enviando ? '…' : 'Guardar'}
        </button>
      </form>
      {error ? (
        <div style={{ marginTop: 10 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}
      {exito ? (
        <div style={{ marginTop: 10 }}>
          <Alert tone="ok" live>
            Tasa guardada.
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
