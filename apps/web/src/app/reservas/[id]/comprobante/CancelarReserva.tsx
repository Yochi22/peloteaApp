'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

/**
 * Cancelar la reserva. Si ya se pagó (o se subió) el abono, avisamos ANTES
 * de confirmar que no hay devolución — pagar 1 hora y cancelar significa
 * perder esa hora (ver `/api/reservas/[id]/cancelar`). Nunca cancela de un
 * solo clic cuando hay plata de por medio.
 */
export function CancelarReserva({
  reservaId,
  accessToken,
  algoYaPagado,
  montoAbono,
}: {
  reservaId: string;
  accessToken?: string | null;
  algoYaPagado: boolean;
  montoAbono: number;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelada, setCancelada] = useState(false);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const url = accessToken
        ? `/api/reservas/${reservaId}/cancelar?token=${encodeURIComponent(accessToken)}`
        : `/api/reservas/${reservaId}/cancelar`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo cancelar.');
        return;
      }
      setCancelada(true);
      router.refresh();
    } catch {
      setError('Problema de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (cancelada) {
    return (
      <Alert tone="info" title="Reserva cancelada" live>
        {algoYaPagado
          ? `El abono de Bs ${montoAbono.toLocaleString('es-VE')} no se devuelve.`
          : 'Como todavía no habías pagado nada, no perdiste dinero.'}
      </Alert>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        style={{ background: 'none', border: 0, color: 'var(--pl-ink-soft)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
      >
        Cancelar reserva
      </button>
    );
  }

  return (
    <div style={{ border: '1.5px solid var(--pl-danger)', borderRadius: 'var(--pl-radius)', padding: 14 }}>
      {algoYaPagado ? (
        <Alert tone="warn" title="El abono no se devuelve" live>
          Ya pagaste (o enviaste) Bs {montoAbono.toLocaleString('es-VE')} de abono. Si cancelas ahora, el club
          se queda con ese monto — no hay devolución.
        </Alert>
      ) : (
        <p style={{ fontSize: 13 }}>Todavía no pagaste nada — cancelar solo libera el turno.</p>
      )}

      {error ? (
        <div style={{ marginTop: 10 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando}
          style={{ background: 'var(--pl-danger)', color: '#fff', border: 0, borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {enviando ? 'Cancelando…' : algoYaPagado ? 'Sí, cancelar y perder el abono' : 'Sí, cancelar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={enviando}
          style={{ background: 'transparent', border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          No, mantener mi reserva
        </button>
      </div>
    </div>
  );
}
