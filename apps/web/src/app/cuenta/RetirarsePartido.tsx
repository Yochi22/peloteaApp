'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  partido_ya_no_se_puede_dejar: 'Este partido ya se completó — habla con el organizador si necesitas salir.',
  no_estas_en_este_partido: 'Ya no estás en este partido.',
  rate_limited: 'Demasiados intentos. Espera un momento.',
};

/** Botón para que un jugador se retire de un partido abierto al que se unió (solo mientras sigue "ABIERTO"). */
export function RetirarsePartido({ partidoId }: { partidoId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  async function retirarse() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/partidos/${partidoId}/salir`, {
        method: 'POST',
        headers: { 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(MENSAJES[body.error] ?? 'No se pudo retirar del partido.');
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
        Retirarme
      </button>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6, textAlign: 'right' }}>
      <span style={{ fontSize: 12 }}>¿Seguro que quieres retirarte?</span>
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
          onClick={retirarse}
          disabled={enviando}
          style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--pl-danger)', border: 0, borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
        >
          {enviando ? '…' : 'Sí, retirarme'}
        </button>
      </div>
      {error ? <span style={{ fontSize: 11, color: 'var(--pl-danger)' }}>{error}</span> : null}
    </div>
  );
}
