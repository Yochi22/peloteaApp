'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  partido_ya_no_se_puede_cancelar: 'Este partido ya no se puede cancelar desde acá.',
  ya_tiene_reserva: 'Este partido ya tiene una reserva en curso — cancela la reserva en vez del partido.',
  rate_limited: 'Demasiados intentos. Espera un momento.',
};

/** Botón para que el organizador cancele su propio partido antes de que alguien pague nada. */
export function CancelarPartido({ partidoId }: { partidoId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  async function cancelar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/partidos/${partidoId}/cancelar`, {
        method: 'POST',
        headers: { 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(MENSAJES[body.error] ?? 'No se pudo cancelar el partido.');
        return;
      }
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        style={{ fontSize: 12, color: 'var(--pl-danger)', background: 'none', border: 0, cursor: 'pointer', padding: 0, fontWeight: 600 }}
      >
        Cancelar partido
      </button>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6, textAlign: 'right' }}>
      <span style={{ fontSize: 12 }}>¿Cancelar este partido para todos?</span>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setConfirmar(false)}
          disabled={enviando}
          style={{ fontSize: 12, background: 'none', border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
        >
          No
        </button>
        <button
          type="button"
          onClick={cancelar}
          disabled={enviando}
          style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--pl-danger)', border: 0, borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
        >
          {enviando ? '…' : 'Sí, cancelar'}
        </button>
      </div>
      {error ? <span style={{ fontSize: 11, color: 'var(--pl-danger)' }}>{error}</span> : null}
    </div>
  );
}
