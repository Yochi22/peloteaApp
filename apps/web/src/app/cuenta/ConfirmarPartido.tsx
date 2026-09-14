'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  sin_disponibilidad: 'No hay ninguna cancha libre para esa disciplina a esa hora. Habla con el club para que te ayude a mano.',
  slot_ocupado: 'Alguien más tomó ese horario justo ahora. Intenta de nuevo.',
  ya_tiene_reserva: 'Este partido ya tiene una reserva en curso.',
  sin_tasa_cambio: 'El club todavía no cargó la tasa de cambio de hoy. Intenta más tarde.',
  rate_limited: 'Demasiados intentos. Espera un momento.',
};

/**
 * El organizador dispara la reserva de verdad una vez el partido se llenó —
 * nunca pasa solo. Revalida disponibilidad en el pool de canchas de esa
 * disciplina en ese momento (pudo cambiar desde que se llenó el partido).
 */
export function ConfirmarPartido({ partidoId }: { partidoId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [dividir, setDividir] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/partidos/${partidoId}/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ dividir }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo confirmar el partido.');
        return;
      }
      router.push(`/reservas/${body.id}/comprobante`);
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="pl-btn" style={{ padding: '6px 14px', fontSize: 12 }}>
        Confirmar y pagar
      </button>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8, border: '1.5px solid var(--pl-line)', borderRadius: 10, padding: 10, minWidth: 220 }}>
      <p style={{ fontSize: 12, fontWeight: 600 }}>¿Cómo se paga?</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input type="radio" checked={dividir} onChange={() => setDividir(true)} /> Entre todos (cada uno su cuota)
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input type="radio" checked={!dividir} onChange={() => setDividir(false)} /> Yo me encargo
      </label>
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" disabled={enviando} onClick={confirmar} className="pl-btn" style={{ flex: 1, padding: '6px 0', fontSize: 12 }}>
          {enviando ? 'Reservando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={enviando}
          style={{ fontSize: 12, background: 'none', border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
