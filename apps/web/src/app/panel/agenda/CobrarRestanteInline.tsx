'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

/**
 * Igual que `PorCobrar.tsx` (la cola general de "por cobrar al llegar" en
 * /panel) pero compacto, para marcarlo sin salir de la agenda del día — acá
 * el staff ya está viendo quién llega a qué hora, tiene sentido cobrar el
 * resto (pago parcial en reservas largas) desde el mismo lugar.
 */
export function CobrarRestanteInline({ reservaId, montoRestante }: { reservaId: string; montoRestante: number }) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<'EFECTIVO' | 'PAGO_MOVIL' | 'TARJETA'>('EFECTIVO');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  async function marcarCobrado() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservas/${reservaId}/cobrar-restante`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ metodo }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo marcar.');
        return;
      }
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{ fontSize: 11, fontWeight: 700, color: 'var(--pl-clay-deep)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
      >
        Falta cobrar Bs {montoRestante.toLocaleString('es-VE')} →
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={metodo}
        onChange={(e) => setMetodo(e.target.value as 'EFECTIVO' | 'PAGO_MOVIL' | 'TARJETA')}
        style={{ border: '1.5px solid var(--pl-line)', borderRadius: 6, padding: '2px 4px', fontSize: 11 }}
      >
        <option value="EFECTIVO">Efectivo</option>
        <option value="PAGO_MOVIL">Pago móvil</option>
        <option value="TARJETA">Tarjeta</option>
      </select>
      <button
        type="button"
        disabled={enviando}
        onClick={marcarCobrado}
        style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--pl-ok)', border: 0, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
      >
        {enviando ? '…' : `Cobrado Bs ${montoRestante.toLocaleString('es-VE')}`}
      </button>
      {error ? <span style={{ fontSize: 10, color: 'var(--pl-danger)' }}>{error}</span> : null}
    </span>
  );
}
