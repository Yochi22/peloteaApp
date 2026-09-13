'use client';

import { useState } from 'react';
import type * as React from 'react';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function GuestPagoForm({ token, estadoInicial }: { token: string; estadoInicial: string }) {
  const [estado, setEstado] = useState(estadoInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch(`/api/cuotas/token/${token}/comprobante`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) {
        const mensajes: Record<string, string> = { rate_limited: 'Demasiados intentos. Espera un momento.' };
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

  if (estado !== 'PENDIENTE') {
    return (
      <div style={{ marginTop: 20 }}>
        <Alert tone="ok" title="Comprobante enviado" live>
          El club va a revisarlo. En cuanto todos paguen su parte, la cancha queda confirmada.
        </Alert>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 20, display: 'grid', gap: 12 }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
        Tu nombre (opcional)
        <input
          type="text"
          name="nombre"
          maxLength={80}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>
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
  );
}
