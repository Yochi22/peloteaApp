'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para esto.',
  sin_permiso: 'No tienes permiso para esto.',
  no_se_pudo_reiniciar: 'No se pudo contactar al worker. Intenta de nuevo en un momento.',
};

export function ReiniciarWhatsapp({ conectado }: { conectado: boolean }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reiniciar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/whatsapp/reiniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo reiniciar.');
        return;
      }
      setConfirmando(false);
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  if (!confirmando) {
    return (
      <div>
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setConfirmando(true)}>
          {conectado ? 'Desvincular y generar QR nuevo' : 'Generar QR nuevo'}
        </button>
        {error ? (
          <div style={{ marginTop: 10 }}>
            <Alert tone="danger" live>
              {error}
            </Alert>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ border: '1.5px solid var(--pl-danger)', borderRadius: 'var(--pl-radius)', padding: 14 }}>
      <Alert tone="warn" title="Esto desvincula el WhatsApp actual" live>
        {conectado
          ? 'El club deja de recibir/enviar mensajes hasta que alguien escanee el QR nuevo con un teléfono.'
          : 'Borra el intento de vinculación actual y genera un código nuevo.'}
      </Alert>
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
          onClick={reiniciar}
          disabled={enviando}
          style={{ background: 'var(--pl-danger)', color: '#fff', border: 0, borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {enviando ? 'Reiniciando…' : 'Sí, reiniciar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={enviando}
          className="pl-btn pl-btn--ghost"
          style={{ padding: '9px 16px', fontSize: 13 }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
