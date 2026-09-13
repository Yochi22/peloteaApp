'use client';

import { useState } from 'react';
import { Alert } from '@pelotea/ui';

export interface PorCobrarItem {
  reservaId: string;
  persona: string;
  cancha: string;
  inicio: string;
  montoRestante: number;
}

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function Fila({ item, onCobrado }: { item: PorCobrarItem; onCobrado: () => void }) {
  const [metodo, setMetodo] = useState<'EFECTIVO' | 'PAGO_MOVIL' | 'TARJETA'>('EFECTIVO');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarCobrado() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservas/${item.reservaId}/cobrar-restante`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ metodo }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo marcar.');
        return;
      }
      onCobrado();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ fontWeight: 700 }}>{item.persona}</p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
            {item.cancha} · {new Date(item.inicio).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
        <strong style={{ flex: 'none', color: 'var(--pl-clay-deep)' }}>Bs {item.montoRestante.toLocaleString('es-VE')}</strong>
      </div>

      {error ? (
        <div style={{ marginTop: 8 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as 'EFECTIVO' | 'PAGO_MOVIL' | 'TARJETA')}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '6px 8px', fontSize: 12 }}
        >
          <option value="EFECTIVO">Efectivo</option>
          <option value="PAGO_MOVIL">Pago móvil</option>
          <option value="TARJETA">Tarjeta de débito</option>
        </select>
        <button
          type="button"
          disabled={enviando}
          onClick={marcarCobrado}
          style={{ flex: 1, background: 'var(--pl-ok)', color: '#fff', border: 0, borderRadius: 7, padding: '7px 0', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {enviando ? '…' : 'Marcar cobrado — entregar pelota'}
        </button>
      </div>
    </div>
  );
}

export function PorCobrar({ inicial }: { inicial: PorCobrarItem[] }) {
  const [items, setItems] = useState(inicial);

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: 17, marginBottom: 12 }}>Por cobrar al llegar</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((it) => (
          <Fila key={it.reservaId} item={it} onCobrado={() => setItems((prev) => prev.filter((x) => x.reservaId !== it.reservaId))} />
        ))}
      </div>
    </div>
  );
}
