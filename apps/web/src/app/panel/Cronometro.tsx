'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function fmtRestante(ms: number): string {
  const negativo = ms < 0;
  const totalSeg = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(totalSeg / 60);
  const s = totalSeg % 60;
  return `${negativo ? '-' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Cuenta regresiva en vivo desde que el staff le da "iniciar tiempo" a una
 * reserva (cuando el cliente retira la pelota) hasta que se cumple la
 * duración pagada. Pasado el cero sigue contando en rojo ("tiempo extra")
 * en vez de desaparecer — el staff necesita ver CUÁNTO se está pasando, no
 * solo que ya se acabó. La alerta por WhatsApp al staff la manda el worker
 * (`jobs/alerta-cronometro.ts`) — esto es solo la vista en vivo mientras
 * alguien tiene el panel abierto.
 */
export function Cronometro({
  reservaId,
  inicio,
  fin,
  tiempoIniciadoEn,
}: {
  reservaId: string;
  inicio: string;
  fin: string;
  tiempoIniciadoEn: string | null;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const duracionMs = new Date(fin).getTime() - new Date(inicio).getTime();
  const finTiempo = tiempoIniciadoEn ? new Date(tiempoIniciadoEn).getTime() + duracionMs : null;

  useEffect(() => {
    if (!tiempoIniciadoEn) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tiempoIniciadoEn]);

  async function iniciar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservas/${reservaId}/iniciar-tiempo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo iniciar el cronómetro.');
        return;
      }
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  async function reiniciar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservas/${reservaId}/iniciar-tiempo`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo reiniciar.');
        return;
      }
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  if (!finTiempo) {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <button
          type="button"
          disabled={enviando}
          onClick={iniciar}
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--pl-hard-deep)', background: 'none', border: '1.5px solid var(--pl-hard)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
        >
          ⏱ Iniciar tiempo
        </button>
        {error ? <span style={{ fontSize: 10, color: 'var(--pl-danger)' }}>{error}</span> : null}
      </span>
    );
  }

  const restanteMs = finTiempo - ahora;
  const seCumplio = restanteMs <= 0;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'var(--pl-font-mono, monospace)',
          padding: '2px 8px',
          borderRadius: 999,
          color: seCumplio ? '#fff' : 'var(--pl-ok)',
          background: seCumplio ? 'var(--pl-danger)' : 'transparent',
          border: seCumplio ? 'none' : '1.5px solid var(--pl-ok)',
        }}
        title={seCumplio ? 'Tiempo extra — hay que recoger la pelota' : 'Tiempo restante'}
      >
        {seCumplio ? '⏰ ' : ''}
        {fmtRestante(restanteMs)}
      </span>
      <button
        type="button"
        disabled={enviando}
        onClick={reiniciar}
        title="Reiniciar cronómetro"
        style={{ fontSize: 10, color: 'var(--pl-ink-soft)', background: 'none', border: 0, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
      >
        reiniciar
      </button>
      {error ? <span style={{ fontSize: 10, color: 'var(--pl-danger)' }}>{error}</span> : null}
    </span>
  );
}
