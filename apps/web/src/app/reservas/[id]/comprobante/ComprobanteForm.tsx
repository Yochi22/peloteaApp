'use client';

import { useEffect, useState } from 'react';
import type * as React from 'react';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function useCountdown(hastaISO: string | null) {
  const [restanteSec, setRestanteSec] = useState<number | null>(null);
  useEffect(() => {
    if (!hastaISO) return;
    const hasta = new Date(hastaISO).getTime();
    const tick = () => setRestanteSec(Math.max(0, Math.round((hasta - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hastaISO]);
  return restanteSec;
}

export function ComprobanteForm({
  reservaId,
  estadoInicial,
  holdExpiraEnISO,
  accessToken,
}: {
  reservaId: string;
  estadoInicial: string;
  holdExpiraEnISO: string | null;
  /** Solo para reservas de invitado (sin cuenta) — viaja como `?token=`. */
  accessToken?: string | null;
}) {
  const [estado, setEstado] = useState(estadoInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restanteSec = useCountdown(estado === 'PENDIENTE_PAGO' ? holdExpiraEnISO : null);

  // `useState(estadoInicial)` solo lee el prop al montar — si la reserva se
  // confirma por otra vía mientras este formulario ya está en pantalla (p.ej.
  // staff la aprobó y el padre hizo `router.refresh()`), el componente se
  // queda mostrando el formulario de subida aunque ya no haga falta.
  // Sincronizamos con el prop cuando cambia.
  useEffect(() => setEstado(estadoInicial), [estadoInicial]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const archivo = form.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError('Selecciona la captura del pago.');
      return;
    }

    setEnviando(true);
    try {
      const url = accessToken
        ? `/api/reservas/${reservaId}/comprobante?token=${encodeURIComponent(accessToken)}`
        : `/api/reservas/${reservaId}/comprobante`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
          'x-csrf-token': leerCookie('pl_csrf') ?? '',
        },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) {
        const mensajes: Record<string, string> = {
          rate_limited: 'Demasiados envíos. Espera un momento.',
        };
        setError(mensajes[body.error] ?? body.error ?? 'No se pudo enviar el comprobante.');
        return;
      }
      setEstado(body.estado);
    } catch {
      setError('Hubo un problema de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (estado !== 'PENDIENTE_PAGO') {
    return (
      <div style={{ marginTop: 20 }}>
        <Alert tone="ok" title="Comprobante enviado" live>
          El club tiene hasta 2 horas para revisarlo. Te avisamos por WhatsApp cuando quede confirmada.
        </Alert>
      </div>
    );
  }

  return (
    <>
      {restanteSec !== null ? (
        <div style={{ marginTop: 20 }}>
          <Alert
            tone={restanteSec < 120 ? 'danger' : 'warn'}
            title={`Apartamos tu cancha · ${Math.floor(restanteSec / 60)}:${String(restanteSec % 60).padStart(2, '0')}`}
            live
          >
            Envía el comprobante antes de que se acabe el tiempo o el turno se libera.
          </Alert>
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Captura del pago (JPG, PNG o PDF · máx. 5 MB)
          <input type="file" name="archivo" accept="image/png,image/jpeg,image/webp,application/pdf" required />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Número de referencia (opcional)
          <input
            type="text"
            name="referencia"
            maxLength={40}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}

        <button className="pl-btn" type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar comprobante'}
        </button>
      </form>
    </>
  );
}
